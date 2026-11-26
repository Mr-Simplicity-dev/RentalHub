import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('./api', () => ({ default: { get: vi.fn(), post: vi.fn() } }));

import api from './api';
import { multilingualService } from './multilingualService';
import { propertyService } from './propertyService';
import { messageService } from './messageService';
import { canTranslateMessageRecord } from '../utils/translationUi';

describe('translation API payloads', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('public multilingual config is read from the minimal endpoint', async () => {
    api.get.mockResolvedValueOnce({ data: { features: { propertyDescriptionTranslationEnabled: true, messageTranslationEnabled: false } } });
    const result = await multilingualService.getConfig();
    expect(api.get).toHaveBeenCalledWith('/multilingual/config');
    expect(result.features.propertyDescriptionTranslationEnabled).toBe(true);
    expect(result.features.messageTranslationEnabled).toBe(false);
  });

  test('property translation sends only an id and target language', async () => {
    api.post.mockResolvedValueOnce({ data: { success: true } });
    await propertyService.translateDescription(12, 'fr');
    expect(api.post).toHaveBeenCalledWith('/properties/12/translate-description', {
      target_language: 'fr',
    });
  });

  test('message translation sends only an id and target language', async () => {
    api.post.mockResolvedValueOnce({ data: { success: true } });
    await messageService.translateMessage(44, 'ha');
    expect(api.post).toHaveBeenCalledWith('/messages/44/translate', {
      target_language: 'ha',
    });
  });

  test('frontend hides translation for unsupported or media-bearing messages', () => {
    expect(canTranslateMessageRecord({ message_type: 'general', message_text: 'Hello' })).toBe(true);
    expect(canTranslateMessageRecord({ message_type: 'escalation', message_text: 'Hello' })).toBe(false);
    expect(canTranslateMessageRecord({ message_type: 'general', attachment_url: 'https://cdn.example.test/a' })).toBe(false);
    expect(canTranslateMessageRecord({ message_type: 'general', voice_note: 'voice-1' })).toBe(false);
  });
});
