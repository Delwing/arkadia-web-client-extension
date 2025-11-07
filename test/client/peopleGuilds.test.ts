import { resolveGuild } from '@modules/data/peopleGuilds';

describe('resolveGuild', () => {
  it('maps numeric ids to guild codes', () => {
    expect(resolveGuild(1)).toBe('CKN');
    expect(resolveGuild(22)).toBe('GP');
  });

  it('maps numeric strings to guild codes', () => {
    expect(resolveGuild(' 2 ')).toBe('ES');
    expect(resolveGuild('10')).toBe('WKS');
  });

  it('returns normalized string guild codes when provided', () => {
    expect(resolveGuild('  NPC ')).toBe('NPC');
    expect(resolveGuild('CKN')).toBe('CKN');
  });

  it('falls back to NPC for unknown or invalid values', () => {
    expect(resolveGuild(null)).toBe('NPC');
    expect(resolveGuild(undefined)).toBe('NPC');
    expect(resolveGuild(999)).toBe('NPC');
    expect(resolveGuild('')).toBe('NPC');
  });
});
