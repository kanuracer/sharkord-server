export type TTokenPayload = {
  userId: number;
  appPasswordId?: number;
  exp: number;
};

export type TConnectionInfo = {
  ip?: string;
  os?: string;
  device?: string;
  userAgent?: string;
};
