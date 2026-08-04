import net from "node:net";
import tls from "node:tls";

export interface SmtpConfig {
  host: string;
  port: number;
  encryption: "none" | "starttls" | "ssl";
  username: string;
  password: string;
  fromName: string;
  fromEmail: string;
  replyTo: string;
}

interface SmtpReply {
  code: number;
  message: string;
}

function encodedWord(value: string) {
  return /^[\x20-\x7e]*$/.test(value) ? value : `=?UTF-8?B?${Buffer.from(value).toString("base64")}?=`;
}

function mailbox(name: string, email: string) {
  return name.trim() ? `${encodedWord(name.trim())} <${email}>` : email;
}

function messageBody(config: SmtpConfig, to: string, subject: string, text: string) {
  const headers = [
    `Date: ${new Date().toUTCString()}`,
    `From: ${mailbox(config.fromName, config.fromEmail)}`,
    `To: ${to}`,
    `Subject: ${encodedWord(subject)}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
  ];
  if (config.replyTo.trim()) headers.push(`Reply-To: ${config.replyTo.trim()}`);
  const encoded = Buffer.from(text, "utf8").toString("base64").replace(/.{1,76}/g, "$&\r\n").trimEnd();
  return `${headers.join("\r\n")}\r\n\r\n${encoded}`;
}

class SmtpConnection {
  private socket: net.Socket | tls.TLSSocket;
  private buffer = "";
  private waiters: Array<{ resolve: (reply: SmtpReply) => void; reject: (error: Error) => void }> = [];
  private lines: string[] = [];

  constructor(socket: net.Socket | tls.TLSSocket) {
    this.socket = socket;
    this.bind();
  }

  private bind() {
    this.socket.setEncoding("utf8");
    this.socket.on("data", chunk => {
      this.buffer += chunk;
      const parts = this.buffer.split(/\r?\n/);
      this.buffer = parts.pop() || "";
      for (const line of parts) this.acceptLine(line);
    });
    this.socket.on("error", error => this.rejectAll(error));
    this.socket.on("close", () => this.rejectAll(new Error("SMTP 连接已关闭")));
  }

  private acceptLine(line: string) {
    if (!/^\d{3}[ -]/.test(line)) return;
    this.lines.push(line);
    if (line[3] === "-") return;
    const waiter = this.waiters.shift();
    if (!waiter) return;
    const message = this.lines.join("\n");
    this.lines = [];
    waiter.resolve({ code: Number(line.slice(0, 3)), message });
  }

  private rejectAll(error: Error) {
    for (const waiter of this.waiters.splice(0)) waiter.reject(error);
  }

  reply() {
    return new Promise<SmtpReply>((resolve, reject) => this.waiters.push({ resolve, reject }));
  }

  async command(command: string, accepted: number[]) {
    this.socket.write(`${command}\r\n`);
    const reply = await this.reply();
    if (!accepted.includes(reply.code)) throw new Error(`SMTP 命令失败（${reply.code}）：${reply.message.slice(0, 300)}`);
    return reply;
  }

  async upgrade(host: string) {
    this.socket.removeAllListeners();
    this.socket = tls.connect({ socket: this.socket, servername: host, rejectUnauthorized: true });
    await new Promise<void>((resolve, reject) => {
      this.socket.once("secureConnect", resolve);
      this.socket.once("error", reject);
    });
    this.bind();
  }

  write(data: string) {
    this.socket.write(data);
  }

  close() {
    this.socket.end();
  }
}

function connect(config: SmtpConfig) {
  return new Promise<SmtpConnection>((resolve, reject) => {
    const options = { host: config.host, port: config.port };
    const socket = config.encryption === "ssl"
      ? tls.connect({ ...options, servername: config.host, rejectUnauthorized: true })
      : net.connect(options);
    socket.setTimeout(15_000, () => socket.destroy(new Error("SMTP 连接超时")));
    const event = config.encryption === "ssl" ? "secureConnect" : "connect";
    socket.once(event, () => resolve(new SmtpConnection(socket)));
    socket.once("error", reject);
  });
}

export async function sendSmtpMail(config: SmtpConfig, to: string, subject: string, text: string) {
  const connection = await connect(config);
  try {
    let reply = await connection.reply();
    if (reply.code !== 220) throw new Error(`SMTP 服务未就绪：${reply.message}`);
    await connection.command(`EHLO ${config.host}`, [250]);
    if (config.encryption === "starttls") {
      await connection.command("STARTTLS", [220]);
      await connection.upgrade(config.host);
      await connection.command(`EHLO ${config.host}`, [250]);
    }
    if (config.username) {
      await connection.command("AUTH LOGIN", [334]);
      await connection.command(Buffer.from(config.username).toString("base64"), [334]);
      await connection.command(Buffer.from(config.password).toString("base64"), [235]);
    }
    await connection.command(`MAIL FROM:<${config.fromEmail}>`, [250]);
    await connection.command(`RCPT TO:<${to}>`, [250, 251]);
    await connection.command("DATA", [354]);
    const body = messageBody(config, to, subject, text).replace(/(^|\r\n)\./g, "$1..");
    connection.write(`${body}\r\n.\r\n`);
    reply = await connection.reply();
    if (reply.code !== 250) throw new Error(`SMTP 邮件提交失败：${reply.message}`);
    await connection.command("QUIT", [221]).catch(() => undefined);
  } finally {
    connection.close();
  }
}
