let localPeerId = 'unknown';

export const setLoggerPeerId = (id: string) => {
  localPeerId = id;
};

const format = (msg: string) => `[P2P:${localPeerId}@${Date.now()}] ${msg}`;

export const logger = {
  log: (msg: string, ...args: any[]) => console.log(format(msg), ...args),
  warn: (msg: string, ...args: any[]) => console.warn(format(msg), ...args),
  error: (msg: string, ...args: any[]) => console.error(format(msg), ...args),
  debug: (msg: string, ...args: any[]) => console.debug(format(msg), ...args),
};
