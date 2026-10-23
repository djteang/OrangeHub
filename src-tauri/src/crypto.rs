//! Secret vault: master-password key derivation + authenticated encryption.
//!
//! Design notes
//! ------------
//! * The vault key is 32 bytes. It is derived from the user's master password
//!   with Argon2id, or generated from the OS CSPRNG in "convenience" mode.
//! * Secrets are sealed with AES-256-GCM. The nonce is random per record and
//!   stored alongside the ciphertext, so re-encrypting the same password never
//!   produces the same bytes twice.
//! * Nothing here writes the key to disk except in convenience mode, where the
//!   key file is marked hidden and given owner-only ACLs. That mode is a
//!   deliberate convenience trade-off, surfaced in the UI as such.

use aes_gcm::aead::{Aead, KeyInit, Payload};
use aes_gcm::{Aes256Gcm, Nonce};
use argon2::{Algorithm, Argon2, Params, Version};
use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine as _;
use zeroize::Zeroizing;

use crate::error::{AppError, AppResult};

/// Output length of the derived key, in bytes.
pub const KEY_LEN: usize = 32;
/// Salt length for Argon2id, in bytes.
pub const SALT_LEN: usize = 16;
/// AES-GCM nonce length, in bytes.
pub const NONCE_LEN: usize = 12;

/// A 32-byte symmetric key that zeroes itself on drop.
pub type VaultKey = Zeroizing<[u8; KEY_LEN]>;

/// Fill `buf` with cryptographically secure random bytes.
pub fn random_bytes(buf: &mut [u8]) -> AppResult<()> {
    getrandom::fill(buf).map_err(|e| AppError::Crypto(format!("随机数生成失败: {e}")))
}

/// Generate a fresh random key (convenience mode).
pub fn generate_key() -> AppResult<VaultKey> {
    let mut key = Zeroizing::new([0u8; KEY_LEN]);
    random_bytes(key.as_mut())?;
    Ok(key)
}

/// Generate a fresh salt for a new vault.
pub fn generate_salt() -> AppResult<[u8; SALT_LEN]> {
    let mut salt = [0u8; SALT_LEN];
    random_bytes(&mut salt)?;
    Ok(salt)
}

/// Derive the vault key from a master password.
///
/// Argon2id at 19 MiB / t=2 / p=1 is the crate default and a reasonable
/// interactive-unlock cost; unlocking happens once per session.
pub fn derive_key(password: &str, salt: &[u8]) -> AppResult<VaultKey> {
    let params = Params::DEFAULT;
    let argon = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);

    let mut key = Zeroizing::new([0u8; KEY_LEN]);
    argon
        .hash_password_into(password.as_bytes(), salt, key.as_mut())
        .map_err(|e| AppError::Crypto(format!("密钥派生失败: {e}")))?;
    Ok(key)
}

/// Encrypt `plaintext`, returning base64(nonce ‖ ciphertext‖tag).
pub fn seal(key: &VaultKey, plaintext: &str, aad: &str) -> AppResult<String> {
    let cipher = Aes256Gcm::new_from_slice(key.as_ref())
        .map_err(|_| AppError::Crypto("保险库密钥长度无效".into()))?;

    let mut nonce_bytes = [0u8; NONCE_LEN];
    random_bytes(&mut nonce_bytes)?;
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ct = cipher
        .encrypt(
            nonce,
            Payload {
                msg: plaintext.as_bytes(),
                aad: aad.as_bytes(),
            },
        )
        .map_err(|_| AppError::Crypto("加密失败".into()))?;

    let mut out = Vec::with_capacity(NONCE_LEN + ct.len());
    out.extend_from_slice(&nonce_bytes);
    out.extend_from_slice(&ct);
    Ok(B64.encode(out))
}

/// Decrypt a value produced by [`seal`].
pub fn open(key: &VaultKey, sealed_b64: &str, aad: &str) -> AppResult<String> {
    let raw = B64
        .decode(sealed_b64)
        .map_err(|_| AppError::Crypto("密文格式损坏".into()))?;

    if raw.len() <= NONCE_LEN {
        return Err(AppError::Crypto("密文长度不足".into()));
    }
    let (nonce_bytes, ct) = raw.split_at(NONCE_LEN);
    let cipher = Aes256Gcm::new_from_slice(key.as_ref())
        .map_err(|_| AppError::Crypto("保险库密钥长度无效".into()))?;

    let pt = cipher
        .decrypt(
            Nonce::from_slice(nonce_bytes),
            Payload {
                msg: ct,
                aad: aad.as_bytes(),
            },
        )
        .map_err(|_| AppError::Crypto("解密失败:主密码错误或数据已损坏".into()))?;

    String::from_utf8(pt).map_err(|_| AppError::Crypto("明文不是合法的 UTF-8".into()))
}

/// Associated data binding a sealed value to its owning record.
///
/// Binding the row id means a ciphertext copied to another connection row
/// fails to decrypt, which stops trivial record-swapping in the database file.
pub fn aad_for(connection_id: &str, field: &str) -> String {
    format!("orangehub:v1:{connection_id}:{field}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip() {
        let key = generate_key().unwrap();
        let sealed = seal(&key, "hunter2", "aad").unwrap();
        assert_ne!(sealed, "hunter2");
        assert_eq!(open(&key, &sealed, "aad").unwrap(), "hunter2");
    }

    #[test]
    fn wrong_aad_fails() {
        let key = generate_key().unwrap();
        let sealed = seal(&key, "secret", "aad-a").unwrap();
        assert!(open(&key, &sealed, "aad-b").is_err());
    }

    #[test]
    fn wrong_key_fails() {
        let k1 = generate_key().unwrap();
        let k2 = generate_key().unwrap();
        let sealed = seal(&k1, "secret", "aad").unwrap();
        assert!(open(&k2, &sealed, "aad").is_err());
    }

    #[test]
    fn distinct_nonces() {
        let key = generate_key().unwrap();
        // Same plaintext must never produce identical ciphertext.
        assert_ne!(seal(&key, "x", "a").unwrap(), seal(&key, "x", "a").unwrap());
    }

    #[test]
    fn derivation_is_deterministic() {
        let salt = [7u8; SALT_LEN];
        let a = derive_key("pw", &salt).unwrap();
        let b = derive_key("pw", &salt).unwrap();
        assert_eq!(a.as_ref(), b.as_ref());

        let c = derive_key("pw2", &salt).unwrap();
        assert_ne!(a.as_ref(), c.as_ref());
    }
}
