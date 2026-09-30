export interface PasswordHasher {
  hash(plain: string): Promise<string>;
  verify(plain: string, hash: string): Promise<boolean>;
}

export interface TokenIssuer {
  issue(user: { id: string; role: string; centerId: string | null }): Promise<string>;
}
