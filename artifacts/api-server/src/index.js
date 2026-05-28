import { Client, GatewayIntentBits, ActivityType } from 'discord.js';

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('clientReady', () => {
  console.log(`Logged in as ${client.user.tag}`);
  client.user.setPresence({
    activities: [
      {
        type: ActivityType.Custom,
        name: 'custom',
        state: 'Online and monitoring the ledger. Awaiting cryptographic command.',
      },
    ],
  });
});

client.login(process.env.DISCORD_TOKEN);
