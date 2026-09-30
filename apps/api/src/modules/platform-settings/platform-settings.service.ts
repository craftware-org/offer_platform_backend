import { Inject, Injectable, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { AppError } from '../../common/errors/app-error.js';
import { issuesToFields } from '../../common/validation/validation.pipe.js';
import { DB, type Database } from '../../infrastructure/database/database.module.js';
import { AuditAction, AuditService } from '../audit/audit.service.js';
import { platformSettings } from './platform-settings.schema.js';
import { SETTINGS, SETTING_KEYS, type SettingKey, type SettingValue } from './settings.registry.js';

@Injectable()
export class PlatformSettingsService {
  private readonly logger = new Logger(PlatformSettingsService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  async get<K extends SettingKey>(key: K): Promise<SettingValue<K>> {
    const [row] = await this.db.select().from(platformSettings).where(eq(platformSettings.key, key));
    const definition = SETTINGS[key];
    if (!row) return definition.defaultValue as SettingValue<K>;
    const parsed = definition.schema.safeParse(row.value);
    if (!parsed.success) {
      // A stored value no longer matching the schema must not break the platform.
      this.logger.error({ key }, 'Stored setting is invalid; using default');
      return definition.defaultValue as SettingValue<K>;
    }
    return parsed.data as SettingValue<K>;
  }

  async list() {
    return Promise.all(
      SETTING_KEYS.map(async (key) => ({
        key,
        description: SETTINGS[key].description,
        value: await this.get(key),
        defaultValue: SETTINGS[key].defaultValue,
      })),
    );
  }

  async update(key: SettingKey, value: unknown, actor: { userId: string; requestId?: string }) {
    const parsed = SETTINGS[key].schema.safeParse(value);
    if (!parsed.success) throw AppError.validation(issuesToFields(parsed.error.issues));

    const oldValue = await this.get(key);
    await this.db.transaction(async (tx) => {
      await tx
        .insert(platformSettings)
        .values({ key, value: parsed.data, updatedBy: actor.userId })
        .onConflictDoUpdate({
          target: platformSettings.key,
          set: { value: parsed.data, updatedBy: actor.userId },
        });
      await this.audit.record(
        {
          actorUserId: actor.userId,
          action: AuditAction.SYSTEM_SETTING_CHANGED,
          entityType: 'setting',
          entityId: key,
          oldValue,
          newValue: parsed.data,
          requestId: actor.requestId,
        },
        tx,
      );
    });
    return { key, value: parsed.data };
  }
}
