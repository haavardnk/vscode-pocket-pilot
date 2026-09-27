import type { WebSocket } from 'ws';

interface Phone {
  deviceId: string;
  visible: boolean;
}

export class PhoneRegistry {
  private readonly phones = new Map<WebSocket, Phone>();

  add(socket: WebSocket, deviceId: string): void {
    this.phones.set(socket, { deviceId, visible: false });
    socket.on('close', () => this.phones.delete(socket));
  }

  setVisible(socket: WebSocket, visible: boolean): void {
    const phone = this.phones.get(socket);
    if (phone) phone.visible = visible;
  }

  visible(deviceId: string): boolean {
    return [...this.phones.values()].some((phone) => phone.deviceId === deviceId && phone.visible);
  }

  close(deviceId: string): void {
    for (const [socket, phone] of this.phones)
      if (phone.deviceId === deviceId) socket.close(4401, 'revoked');
  }

  closeMissing(active: ReadonlySet<string>): void {
    for (const [socket, phone] of this.phones)
      if (!active.has(phone.deviceId)) socket.close(4401, 'revoked');
  }
}
