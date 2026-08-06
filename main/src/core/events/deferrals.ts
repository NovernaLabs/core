export interface Deferrals {
  defer(): void;
  update(message: string): void;
  presentCard(card: unknown, callback?: (data: unknown, rawData: string) => void): void;
  done(failureReason?: string): void;
  handover?(data: Record<string, unknown>): void;
}
