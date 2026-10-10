export {};

declare global {
  interface CustomJwtSessionClaims {
    /** Mirrors Clerk publicMetadata; set via Sessions > Customize session token. */
    metadata?: {
      role?: string;
    };
  }
}
