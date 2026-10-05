// Minimal stand-ins for discord.js objects. Only what the code under test touches.

export function fakeLogger() {
  const calls = [];
  const log =
    (level) =>
    (...args) =>
      calls.push({ level, args });
  return {
    calls,
    trace: log('trace'),
    debug: log('debug'),
    info: log('info'),
    warn: log('warn'),
    error: log('error'),
    fatal: log('fatal'),
  };
}

/** @param {'command' | 'button' | 'autocomplete'} kind */
export function fakeInteraction(kind, { name = 'test', customId = 'x', userId = 'u1' } = {}) {
  const sent = [];
  const interaction = {
    sent,
    commandName: name,
    customId,
    user: { id: userId },
    createdTimestamp: Date.now(),
    replied: false,
    deferred: false,
    isAutocomplete: () => kind === 'autocomplete',
    isChatInputCommand: () => kind === 'command',
    isContextMenuCommand: () => false,
    isButton: () => kind === 'button',
    isAnySelectMenu: () => false,
    isModalSubmit: () => false,
    async reply(payload) {
      interaction.replied = true;
      sent.push({ method: 'reply', payload });
    },
    async followUp(payload) {
      sent.push({ method: 'followUp', payload });
    },
    async editReply(payload) {
      sent.push({ method: 'editReply', payload });
    },
    async respond(choices) {
      sent.push({ method: 'respond', payload: choices });
    },
  };
  return interaction;
}
