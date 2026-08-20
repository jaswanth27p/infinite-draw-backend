import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';

// Generous enough that a long work session never needs to refetch
// mid-call; short enough that a leaked credential doesn't grant
// indefinite relay access.
const CREDENTIAL_TTL_SECONDS = 86400;

export interface TurnCredentials {
  username: string;
  credential: string;
  ttl: number;
}

@Injectable()
export class VoiceService {
  generateTurnCredentials(userId: string): TurnCredentials {
    const secret = process.env.TURN_SECRET;
    if (!secret) {
      throw new Error('TURN_SECRET is not configured');
    }

    // coturn's --use-auth-secret mode expects a colon-separated
    // "<expiryUnixTimestamp>:<anything>" username and validates the
    // credential as base64(HMAC-SHA1(username, secret)) — no username/
    // password ever needs to be provisioned or rotated by hand.
    const expiresAt = Math.floor(Date.now() / 1000) + CREDENTIAL_TTL_SECONDS;
    const username = `${expiresAt}:${userId}`;
    const credential = crypto.createHmac('sha1', secret).update(username).digest('base64');

    return { username, credential, ttl: CREDENTIAL_TTL_SECONDS };
  }
}
