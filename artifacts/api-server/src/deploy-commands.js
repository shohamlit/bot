// ============================================================
//  deploy-commands.js
//  Run ONCE (or after any command change) to register all
//  slash commands globally with Discord.
//
//  Usage:  node src/deploy-commands.js
// ============================================================

import 'dotenv/config';
import { REST, Routes, SlashCommandBuilder } from 'discord.js';

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID     = process.env.DISCORD_CLIENT_ID;

if (!DISCORD_TOKEN || !CLIENT_ID) {
  console.error('❌  Missing DISCORD_TOKEN or DISCORD_CLIENT_ID in your environment.');
  process.exit(1);
}

// ── Shared DM & User-Install Configuration ────────────────────
//  integration_types: 0 = GUILD_INSTALL, 1 = USER_INSTALL
//  contexts:          0 = GUILD, 1 = BOT_DM, 2 = PRIVATE_CHANNEL
const IT = [0, 1];
const CT = [0, 1, 2];

// ── Command Definitions ───────────────────────────────────────
const commands = [

  // ── /bep20 ────────────────────────────────────────────────
  new SlashCommandBuilder()
    .setName('bep20')
    .setDescription('Generate a BEP20 USDT payment QR code and listen for confirmation.')
    .addNumberOption((o) =>
      o.setName('amount')
        .setDescription('The exact USDT amount to request (e.g. 10.5)')
        .setRequired(true)
        .setMinValue(0.01)
    )
    .setIntegrationTypes(IT)
    .setContexts(CT),

  // ── /bep20history ─────────────────────────────────────────
  new SlashCommandBuilder()
    .setName('bep20history')
    .setDescription('Show recent USDT payments received by the wallet.')
    .addIntegerOption((o) =>
      o.setName('limit')
        .setDescription('Number of transactions to show (1–10, default 5)')
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(10)
    )
    .setIntegrationTypes(IT)
    .setContexts(CT),

  // ── /math ─────────────────────────────────────────────────
  new SlashCommandBuilder()
    .setName('math')
    .setDescription('Solve a math expression instantly.')
    .addStringOption((o) =>
      o.setName('expression')
        .setDescription('The math expression to evaluate (e.g. 2 + 2, (5^2) * 3 / 2)')
        .setRequired(true)
    )
    .setIntegrationTypes(IT)
    .setContexts(CT),

  // ── /currency ─────────────────────────────────────────────
  new SlashCommandBuilder()
    .setName('currency')
    .setDescription('Convert an amount between currencies using live exchange rates.')
    .addNumberOption((o) =>
      o.setName('amount')
        .setDescription('The amount to convert (e.g. 100)')
        .setRequired(true)
        .setMinValue(0)
    )
    .addStringOption((o) =>
      o.setName('from')
        .setDescription('Source currency code (e.g. USD)')
        .setRequired(true)
        .setMinLength(3)
        .setMaxLength(3)
    )
    .addStringOption((o) =>
      o.setName('to')
        .setDescription('Target currency code (e.g. EUR)')
        .setRequired(true)
        .setMinLength(3)
        .setMaxLength(3)
    )
    .setIntegrationTypes(IT)
    .setContexts(CT),

  // ── /hug ──────────────────────────────────────────────────
  new SlashCommandBuilder()
    .setName('hug')
    .setDescription('Send a warm hug to someone!')
    .addUserOption((o) =>
      o.setName('target').setDescription('The person you want to hug').setRequired(true)
    )
    .setIntegrationTypes(IT)
    .setContexts(CT),

  // ── /pat ──────────────────────────────────────────────────
  new SlashCommandBuilder()
    .setName('pat')
    .setDescription('Give someone a gentle pat on the head!')
    .addUserOption((o) =>
      o.setName('target').setDescription('The person you want to pat').setRequired(true)
    )
    .setIntegrationTypes(IT)
    .setContexts(CT),

  // ── /slap ─────────────────────────────────────────────────
  new SlashCommandBuilder()
    .setName('slap')
    .setDescription('Slap someone — they had it coming.')
    .addUserOption((o) =>
      o.setName('target').setDescription('The person to slap').setRequired(true)
    )
    .setIntegrationTypes(IT)
    .setContexts(CT),

  // ── /kick ─────────────────────────────────────────────────
  new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Give someone a solid kick!')
    .addUserOption((o) =>
      o.setName('target').setDescription('The person to kick').setRequired(true)
    )
    .setIntegrationTypes(IT)
    .setContexts(CT),

  // ── /kiss ─────────────────────────────────────────────────
  new SlashCommandBuilder()
    .setName('kiss')
    .setDescription('Blow a kiss to someone special!')
    .addUserOption((o) =>
      o.setName('target').setDescription('The person to kiss').setRequired(true)
    )
    .setIntegrationTypes(IT)
    .setContexts(CT),

  // ── /wink ─────────────────────────────────────────────────
  new SlashCommandBuilder()
    .setName('wink')
    .setDescription('Give someone a cheeky wink!')
    .addUserOption((o) =>
      o.setName('target').setDescription('The person to wink at').setRequired(true)
    )
    .setIntegrationTypes(IT)
    .setContexts(CT),

  // ── /glare ────────────────────────────────────────────────
  new SlashCommandBuilder()
    .setName('glare')
    .setDescription('Give someone an intense glare.')
    .addUserOption((o) =>
      o.setName('target').setDescription('The person to glare at').setRequired(true)
    )
    .setIntegrationTypes(IT)
    .setContexts(CT),

  // ── /rps ──────────────────────────────────────────────────
  new SlashCommandBuilder()
    .setName('rps')
    .setDescription('Issue an open Rock Paper Scissors challenge — first to accept fights you!')
    .setIntegrationTypes(IT)
    .setContexts(CT),

  // ── /tictactoe ────────────────────────────────────────────
  new SlashCommandBuilder()
    .setName('tictactoe')
    .setDescription('Issue an open Tic-Tac-Toe challenge — first to accept plays you!')
    .setIntegrationTypes(IT)
    .setContexts(CT),

].map((cmd) => cmd.toJSON());

// ── Register with Discord REST API ───────────────────────────
const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

(async () => {
  try {
    console.log('🚀  Registering global slash commands...\n');

    const result = await rest.put(
      Routes.applicationCommands(CLIENT_ID),
      { body: commands },
    );

    console.log(`✅  Successfully registered ${result.length} global command(s):`);
    result.forEach((cmd) => console.log(`    /${cmd.name}  (id: ${cmd.id})`));
    console.log('\n⚠️  Global commands can take up to 1 hour to appear everywhere in Discord.');

  } catch (err) {
    console.error('❌  Failed to register commands:', err);
    process.exit(1);
  }
})();
