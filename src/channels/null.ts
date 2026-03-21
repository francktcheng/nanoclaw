/**
 * Null Channel - allows running NanoClaw without any messaging channels
 * Useful for tool-only use cases (email notifications, etc.)
 */
import { logger } from '../logger.js';
import { registerChannel, ChannelOpts } from './registry.js';
import { Channel } from '../types.js';

export class NullChannel implements Channel {
  name = 'null';
  private connected = false;

  async connect(): Promise<void> {
    this.connected = true;
    logger.debug('Null channel connected (headless mode)');
  }

  async sendMessage(_jid: string, _text: string): Promise<void> {
    // No-op - no actual messaging in headless mode
    logger.debug({ _text }, 'Null channel: message would be sent (headless mode)');
  }

  isConnected(): boolean {
    return this.connected;
  }

  ownsJid(_jid: string): boolean {
    return false;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    logger.debug('Null channel disconnected');
  }
}

// Always register the null channel - it's used when no other channels are configured
registerChannel('null', (_opts: ChannelOpts) => {
  return new NullChannel();
});
