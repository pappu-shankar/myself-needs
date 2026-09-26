// xirr has no published types (nor a @types/xirr package) — shape taken from
// its README: https://github.com/RayDeCampo/nodejs-xirr
declare module "xirr" {
  interface XirrTransaction {
    amount: number;
    when: Date;
  }

  interface XirrOptions {
    guess?: number;
    [key: string]: unknown;
  }

  /** Annualized rate of return as a decimal in [-1, ∞). Throws if fewer than 2 transactions, all same sign, all same day, or Newton's method fails to converge. */
  function xirr(transactions: XirrTransaction[], options?: XirrOptions): number;

  export = xirr;
}
