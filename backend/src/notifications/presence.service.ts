import { Injectable } from '@nestjs/common';

export type PresenceStatus = 'online' | 'offline' | 'away';

export interface UserPresence {
  userId: string;
  status: PresenceStatus;
  lastSeen: Date;
}

@Injectable()
export class PresenceService {
  // In-memory presence store: userId -> presence data
  private presenceMap = new Map<string, UserPresence>();

  // Track how many socket connections each user has (multiple tabs)
  private connectionCount = new Map<string, number>();

  setOnline(userId: string): UserPresence {
    const count = (this.connectionCount.get(userId) || 0) + 1;
    this.connectionCount.set(userId, count);

    const presence: UserPresence = {
      userId,
      status: 'online',
      lastSeen: new Date(),
    };
    this.presenceMap.set(userId, presence);
    return presence;
  }

  setOffline(userId: string): UserPresence {
    const count = (this.connectionCount.get(userId) || 1) - 1;
    this.connectionCount.set(userId, count);

    // Only mark offline if no more connections
    if (count <= 0) {
      this.connectionCount.delete(userId);
      const presence: UserPresence = {
        userId,
        status: 'offline',
        lastSeen: new Date(),
      };
      this.presenceMap.set(userId, presence);
      return presence;
    }

    // Still has other connections, remain online
    return this.presenceMap.get(userId)!;
  }

  setAway(userId: string): UserPresence {
    const presence: UserPresence = {
      userId,
      status: 'away',
      lastSeen: new Date(),
    };
    this.presenceMap.set(userId, presence);
    return presence;
  }

  setStatus(userId: string, status: PresenceStatus): UserPresence {
    const presence: UserPresence = {
      userId,
      status,
      lastSeen: new Date(),
    };
    this.presenceMap.set(userId, presence);
    return presence;
  }

  getPresence(userId: string): UserPresence {
    return this.presenceMap.get(userId) || { userId, status: 'offline', lastSeen: new Date() };
  }

  getPresenceByTenant(userIds: string[]): UserPresence[] {
    return userIds.map((id) => this.getPresence(id));
  }

  getAllOnline(): UserPresence[] {
    return Array.from(this.presenceMap.values()).filter((p) => p.status === 'online');
  }
}
