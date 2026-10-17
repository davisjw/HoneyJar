declare module "nodemailer" {
  export function createTransport(opts: object): {
    sendMail(msg: { from?: string; to: string; subject: string; text: string }): Promise<unknown>;
  };
}
