// ============================================================
//  deploy-commands.js
//  Run ONCE (or after any command change) to register the
//  /bep20 slash command globally with Discord.
//
//  Usage:  node src/deploy-commands.js
// ============================================================

import 'dotenv/config';
import { REST, Routes, SlashCommandBuilder } from 'discord.js';

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID     = process.env.DISCORD_CLIENT_ID; // Your bot's Application ID

if (!DISCORD_TOKEN || !CLIENT_ID) {
  console.error('❌  Missing DISCORD_TOKEN or DISCORD_CLIENT_ID in your .env file.');
  process.exit(1);
}

// ── Build the Slash Command ───────────────────────────────────
const bep20Command = new SlashCommandBuilder()
  .setName('bep20')
  .setDescription('Generate a BEP20 USDT payment QR code and listen for confirmation.')
  .addNumberOption((option) =>
    option
      .setName('amount')
      .setDescription('The exact USDT amount to request (e.g. 10.5)')
      .setRequired(true)
      .setMinValue(0.01)
  );

// Convert to a plain JSON object so we can inject Discord API properties
// that the SlashCommandBuilder doesn't yet expose as methods in some v14 builds.
const commandJSON = bep20Command.toJSON();

// ── CRITICAL: DM & User-Install Configuration ─────────────────
//
//  integration_types:
//    0 = GUILD_INSTALL   (normal server bot)
//    1 = USER_INSTALL    (user-installed app, required for DM usage)
//
//  contexts:
//    0 = GUILD           (inside a server channel)
//    1 = BOT_DM          (DM with the bot itself)
//    2 = PRIVATE_CHANNEL (Group DMs / other private contexts)
//
//  Setting both 0 and 1 for integration_types allows the command to
//  work whether the bot is added to a server OR installed as a user app.
//  The contexts array tells Discord WHERE the command can be invoked.
//
commandJSON.integration_types = [0, 1]; // Guild Install + User Install
commandJSON.contexts           = [0, 1, 2]; // Everywhere

// ── Register with Discord REST API ───────────────────────────
const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

(async () => {
  try {
    console.log('🚀  Registering global slash command...\n');

    // Global registration (takes up to 1 hour to propagate everywhere)
    const result = await rest.put(
      Routes.applicationCommands(CLIENT_ID),
      { body: [commandJSON] },
    );

    console.log(`✅  Successfully registered ${result.length} global command(s):`);
    result.forEach((cmd) => console.log(`    /${cmd.name}  (id: ${cmd.id})`));
    console.log('\n⚠️  Global commands can take up to 1 hour to appear in Discord.');
    console.log('    For instant testing in a single server, use Routes.applicationGuildCommands() instead.');

  } catch (err) {
    console.error('❌  Failed to register commands:', err);
    process.exit(1);
  }
})();
