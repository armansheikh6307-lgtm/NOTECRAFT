declare module 'bcryptjs' {
  export function hash(s: string, salt: number | string): Promise<string>
  export function hashSync(s: string, salt?: number | string): string
  export function compare(s: string, hash: string): Promise<boolean>
  export function compareSync(s: string, hash: string): boolean
  export function genSalt(rounds?: number): Promise<string>
  export function genSaltSync(rounds?: number): string
}

declare module 'jsonwebtoken' {
  export interface SignOptions {
    expiresIn?: string | number
    algorithm?: string
    issuer?: string
    subject?: string
    audience?: string | string[]
  }

  export interface JwtPayload {
    userId?: string
    email?: string
    [key: string]: any
  }

  export function sign(
    payload: string | Buffer | object,
    secretOrPrivateKey: string | Buffer,
    options?: SignOptions
  ): string

  export function verify(
    token: string,
    secretOrPublicKey: string | Buffer,
    options?: any
  ): JwtPayload | string
}

