import 'dotenv/config';
import http from 'http';
import {
  Client,
  GatewayIntentBits,
  ActivityType,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  AttachmentBuilder,
} from 'discord.js';
import { ethers } from 'ethers';
import QRCode from 'qrcode';
import axios from 'axios';

// ── Health server (keeps the Replit workflow alive) ───────────
const PORT = process.env.PORT || 8080;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('OK');
}).listen(PORT, () => {
  console.log(`Health server listening on port ${PORT}`);
});

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// ── Constants ─────────────────────────────────────────────────

const COLLECTOR_TIMEOUT = 2 * 60 * 1000; // 2 minutes

const TTT_WIN_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

const RPS_EMOJI = { rock: '🪨', paper: '📄', scissors: '✂️' };
const RPS_BEATS = { rock: 'scissors', paper: 'rock', scissors: 'paper' };

// ── BEP20 / Payment Constants ─────────────────────────────────

const USDT_BSC_ADDRESS = '0x55d398326f99059fF775485246999027B3197955';
const USDT_DECIMALS    = 18;
const PAYMENT_TIMEOUT  = 15 * 60 * 1000; // 15 minutes
const POLL_INTERVAL    = 15 * 1000;       // poll every 15 seconds

const ERC20_ABI = [
  'event Transfer(address indexed from, address indexed to, uint256 value)',
];

// ── Action Command Aesthetics ─────────────────────────────────
const ACTION_CONFIG = {
  hug:   { apiUrl: 'https://nekos.best/api/v2/hug',   color: '#FFAAA5', emoji: '💖', verb: 'wraps', suffix: 'in a cozy hug.', footer: 'Everyone needs a hug sometimes' },
  pat:   { apiUrl: 'https://nekos.best/api/v2/pat',   color: '#FFD3B6', emoji: '🌸', verb: 'gently pats', suffix: '\'s head.', footer: 'There, there...' },
  slap:  { apiUrl: 'https://nekos.best/api/v2/slap',  color: '#FF8C94', emoji: '💥', verb: 'just slapped', suffix: 'back to the lobby!', footer: 'OUCH!' },
  wink:  { apiUrl: 'https://nekos.best/api/v2/wink',  color: '#FCEFC8', emoji: '✨', verb: 'gives', suffix: 'a little wink. 😉', footer: 'Cheeky!' },
  kiss:  { apiUrl: 'https://nekos.best/api/v2/kiss',  color: '#F686BD', emoji: '💕', verb: 'plants a sweet kiss on', suffix: '!', footer: 'Smooch!' },
  kick:  { apiUrl: 'https://nekos.best/api/v2/kick',  color: '#D9534F', emoji: '🥋', verb: 'kicks', suffix: 'into the stratosphere!', footer: 'HYAAH!' },
  glare: { apiUrl: 'https://nekos.best/api/v2/stare', color: '#2C3E50', emoji: '👀', verb: 'is glaring intensely at', suffix: '...', footer: 'Stare...' }
};


// ── Helpers ───────────────────────────────────────────────────

async function fetchAnimuGif(apiUrl) {
  const response = await axios.get(apiUrl, {
    timeout: 8000,
    headers: { 'User-Agent': 'DiscordBot/1.0 Node.js' },
  });
  // nekos.best format: { results: [{ url, anime_name }] }
  const gifUrl = response.data?.results?.[0]?.url;
  if (!gifUrl) throw new Error('No gif URL in API response');
  return gifUrl;
}

async function buildVictoryEmbed(winner, title, description) {
  const gif   = await fetchAnimuGif('https://nekos.best/api/v2/wink?amount=1').catch(() => null);
  const embed = new EmbedBuilder()
    .setColor(0xFFD700)
    .setTitle(title)
    .setDescription(description)
    .setFooter({ text: 'GG WP! 🏆' });
  if (gif) embed.setImage(gif);
  return embed;
}

// ── Safe Math Evaluator ───────────────────────────────────────

function safeEval(expression) {
  // Whitelist: digits, basic operators, parentheses, decimal points, spaces
  // Also allow ^ as alias for ** (exponentiation)
  const sanitized = expression.trim().replace(/\^/g, '**');
  if (!/^[\d+\-*/().\s%]+$/.test(sanitized)) {
    throw new Error('Expression contains invalid characters. Only numbers and `+ - * / % ^ ( )` are allowed.');
  }
  // eslint-disable-next-line no-new-func
  const result = Function(`'use strict'; return (${sanitized})`)();
  if (typeof result !== 'number' || !isFinite(result)) {
    throw new Error('Expression produced an invalid result (e.g. division by zero).');
  }
  return result;
}

// ── Tic-Tac-Toe Utilities ─────────────────────────────────────

function buildTttRows(board, disabled = false) {
  const rows = [];
  for (let r = 0; r < 3; r++) {
    const row = new ActionRowBuilder();
    for (let c = 0; c < 3; c++) {
      const idx = r * 3 + c;
      const val = board[idx];
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`ttt_${idx}`)
          .setLabel(val || '\u200b')
          .setStyle(
            val === 'X' ? ButtonStyle.Danger  :
            val === 'O' ? ButtonStyle.Primary :
            ButtonStyle.Secondary
          )
          .setDisabled(disabled || val !== '')
      );
    }
    rows.push(row);
  }
  return rows;
}

function checkTttWinner(board) {
  for (const [a, b, c] of TTT_WIN_LINES) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
  }
  return null;
}

// ── Command: /math ────────────────────────────────────────────

async function handleMath(interaction) {
  const expression = interaction.options.getString('expression');
  let result;
  try {
    result = safeEval(expression);
  } catch (err) {
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xED4245)
          .setTitle('❌ Invalid Expression')
          .setDescription(`\`\`\`${err.message}\`\`\``)
          .addFields({ name: '📥 Your Input', value: `\`${expression}\``, inline: false })
          .setFooter({ text: 'Tip: Use ^ for exponentiation • Example: (5^2 + 10) / 2' }),
      ],
      ephemeral: true,
    });
    return;
  }

  const formatted = Number.isInteger(result)
    ? result.toLocaleString()
    : parseFloat(result.toFixed(10)).toLocaleString();

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x57F287)
        .setTitle('🧮 Calculator')
        .addFields(
          { name: '📥 Expression', value: `\`${expression}\``,        inline: false },
          { name: '📤 Result',     value: `\`\`\`${formatted}\`\`\``, inline: false },
        )
        .setFooter({ text: 'Supports: + − × ÷ % ^ and parentheses' })
        .setTimestamp(),
    ],
  });
}

// ── Command: /currency ────────────────────────────────────────

async function handleCurrency(interaction) {
  await interaction.deferReply();

  const amount = interaction.options.getNumber('amount');
  const from   = interaction.options.getString('from').toUpperCase();
  const to     = interaction.options.getString('to').toUpperCase();

  let data;
  try {
    const controller = new AbortController();
    const timeout    = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(`https://open.er-api.com/v6/latest/${from}`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`API returned ${res.status}`);
    data = await res.json();
  } catch {
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xED4245)
          .setTitle('❌ Service Unavailable')
          .setDescription('The currency API is currently unreachable. Please try again in a moment.')
          .setFooter({ text: 'Powered by open.er-api.com' }),
      ],
    });
    return;
  }

  if (data.result === 'error') {
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xED4245)
          .setTitle('❌ Unknown Currency Code')
          .setDescription(`**\`${from}\`** is not a recognised currency code.`)
          .addFields({ name: '💡 Valid Examples', value: '`USD`  `EUR`  `GBP`  `INR`  `JPY`  `BTC`', inline: false })
          .setFooter({ text: 'Use standard ISO 4217 three-letter codes' }),
      ],
    });
    return;
  }

  const rate = data.rates[to];
  if (!rate) {
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xED4245)
          .setTitle('❌ Unknown Currency Code')
          .setDescription(`**\`${to}\`** is not a recognised currency code.`)
          .addFields({ name: '💡 Valid Examples', value: '`USD`  `EUR`  `GBP`  `INR`  `JPY`  `BTC`', inline: false })
          .setFooter({ text: 'Use standard ISO 4217 three-letter codes' }),
      ],
    });
    return;
  }

  const converted = (amount * rate).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  });
  const rateFormatted = rate.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  });
  const updatedAt = new Date(data.time_last_update_utc).toUTCString();

  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor(0xFEE75C)
        .setTitle('💱 Currency Conversion')
        .setDescription(`Converting **${amount.toLocaleString()} ${from}** → **${to}**`)
        .addFields(
          { name: '💵 Result',  value: `**${converted} ${to}**`,                inline: false },
          { name: '📈 Rate',    value: `\`1 ${from} = ${rateFormatted} ${to}\``, inline: true  },
          { name: '🕒 Updated', value: updatedAt,                                inline: false },
        )
        .setFooter({ text: 'Powered by open.er-api.com' })
        .setTimestamp(),
    ],
  });
}

// ── Action Commands (/hug, /pat, /slap, /kick, /kiss, /wink, /glare) ─────────

async function handleAction(interaction) {
  await interaction.deferReply();
  const cmd    = interaction.commandName;
  const cfg    = ACTION_CONFIG[cmd];
  const target = interaction.options.getUser('target');
  const sender = interaction.user;

  let gif;
  try {
    gif = await fetchAnimuGif(cfg.apiUrl);
  } catch (error) {
    console.error('API Fetch Error:', error);
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xED4245)
          .setTitle('❌ API Unavailable')
          .setDescription('The anime GIF service is temporarily down. Please try again in a moment.')
          .setFooter({ text: 'Powered by nekos.best' }),
      ],
    });
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(cfg.color)
    .setTitle(`${cfg.emoji} ${cmd.charAt(0).toUpperCase() + cmd.slice(1)}!`)
    .setDescription(`**${sender}** ${cfg.verb} **${target}** ${cfg.suffix}`)
    .setImage(gif)
    .setTimestamp()
    .setFooter({ text: cfg.footer });

  // ── Return-action button for kiss / pat / hug ─────────────
  const RETURN_LABELS = { kiss: 'Kiss Back 💋', pat: 'Pat Back 🌸', hug: 'Hug Back 💖' };
  if (RETURN_LABELS[cmd]) {
    const returnRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`return_${cmd}:${sender.id}:${target.id}`)
        .setLabel(RETURN_LABELS[cmd])
        .setStyle(ButtonStyle.Primary)
    );
    await interaction.editReply({ embeds: [embed], components: [returnRow] });
  } else {
    await interaction.editReply({ embeds: [embed] });
  }
}

// ── Command: /rps ─────────────────────────────────────────────

async function handleRps(interaction) {
  const host = interaction.user;

  const lobbyEmbed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('⚔️ Open Challenge')
    .setDescription(`**${host}** has issued a challenge!\n\nPress **Accept** to step into the arena.`)
    .setFooter({ text: 'First to accept fights. Challenge expires in 2 minutes.' })
    .setTimestamp();

  const acceptRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('rps_accept')
      .setLabel('Accept Challenge')
      .setEmoji('⚔️')
      .setStyle(ButtonStyle.Success)
  );

  const msg = await interaction.reply({
    embeds: [lobbyEmbed],
    components: [acceptRow],
    fetchReply: true,
  });

  const acceptCollector = msg.createMessageComponentCollector({
    componentType: ComponentType.Button,
    filter: (i) => i.customId === 'rps_accept' && i.user.id !== host.id,
    max: 1,
    time: COLLECTOR_TIMEOUT,
  });

  acceptCollector.on('collect', async (acceptInteraction) => {
    const challenger = acceptInteraction.user;
    const moves      = {};

    const gameEmbed = new EmbedBuilder()
      .setColor(0xED4245)
      .setTitle('🥊 Rock · Paper · Scissors')
      .setDescription(
        `**${host}** vs **${challenger}**\n\n` +
        `Both players — choose your weapon below.\n` +
        `Your choice is **hidden** until both have locked in.`
      )
      .addFields(
        { name: host.username,       value: '⏳ Thinking…', inline: true },
        { name: challenger.username, value: '⏳ Thinking…', inline: true },
      )
      .setFooter({ text: 'Your selection is only visible to you.' })
      .setTimestamp();

    const rpsRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('rps_rock')    .setLabel('Rock')    .setEmoji('🪨').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('rps_paper')   .setLabel('Paper')   .setEmoji('📄').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('rps_scissors').setLabel('Scissors').setEmoji('✂️').setStyle(ButtonStyle.Secondary),
    );

    const disabledRpsRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('rps_rock')    .setLabel('Rock')    .setEmoji('🪨').setStyle(ButtonStyle.Secondary).setDisabled(true),
      new ButtonBuilder().setCustomId('rps_paper')   .setLabel('Paper')   .setEmoji('📄').setStyle(ButtonStyle.Secondary).setDisabled(true),
      new ButtonBuilder().setCustomId('rps_scissors').setLabel('Scissors').setEmoji('✂️').setStyle(ButtonStyle.Secondary).setDisabled(true),
    );

    await acceptInteraction.update({ embeds: [gameEmbed], components: [rpsRow] });

    const gameCollector = msg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      filter: (i) =>
        ['rps_rock', 'rps_paper', 'rps_scissors'].includes(i.customId) &&
        (i.user.id === host.id || i.user.id === challenger.id),
      time: COLLECTOR_TIMEOUT,
    });

    gameCollector.on('collect', async (moveInteraction) => {
      const userId = moveInteraction.user.id;
      if (moves[userId]) {
        await moveInteraction.reply({ content: '⚠️ You have already locked in your move!', ephemeral: true });
        return;
      }
      const move = moveInteraction.customId.replace('rps_', '');
      moves[userId] = move;
      await moveInteraction.reply({
        content: `🔒 **${RPS_EMOJI[move]} ${move}** locked in! Waiting for your opponent…`,
        ephemeral: true,
      });
      if (Object.keys(moves).length === 2) gameCollector.stop('done');
    });

    gameCollector.on('end', async (_, reason) => {
      if (reason === 'time') {
        await msg.edit({
          embeds: [
            new EmbedBuilder()
              .setColor(0x99AAB5)
              .setTitle('⏱️ Game Timed Out')
              .setDescription('Neither player chose in time. The match has been cancelled.')
              .setFooter({ text: 'Run /rps to start a new game.' }),
          ],
          components: [disabledRpsRow],
        });
        return;
      }

      const hostMove       = moves[host.id];
      const challengerMove = moves[challenger.id];

      if (hostMove === challengerMove) {
        await msg.edit({
          embeds: [
            new EmbedBuilder()
              .setColor(0xFEE75C)
              .setTitle("🤝 It's a Draw!")
              .setDescription(`Both players chose **${RPS_EMOJI[hostMove]} ${hostMove}**. Perfectly matched!`)
              .addFields(
                { name: host.username,       value: `${RPS_EMOJI[hostMove]} ${hostMove}`,             inline: true },
                { name: challenger.username, value: `${RPS_EMOJI[challengerMove]} ${challengerMove}`, inline: true },
              )
              .setFooter({ text: 'Run /rps to play again.' })
              .setTimestamp(),
          ],
          components: [disabledRpsRow],
        });
        return;
      }

      const winner     = RPS_BEATS[hostMove] === challengerMove ? host : challenger;
      const loser      = winner.id === host.id ? challenger : host;
      const winnerMove = moves[winner.id];
      const loserMove  = moves[loser.id];

      const victoryEmbed = await buildVictoryEmbed(
        winner,
        '🏆 Victory!',
        `**${winner}** wins the round!\n\n` +
        `${winner.username}: ${RPS_EMOJI[winnerMove]} **${winnerMove}**\n` +
        `${loser.username}: ${RPS_EMOJI[loserMove]} **${loserMove}**\n\n` +
        `*${winnerMove} beats ${loserMove}!*`
      );
      await msg.edit({ embeds: [victoryEmbed], components: [disabledRpsRow] });
    });
  });

  acceptCollector.on('end', async (collected) => {
    if (collected.size === 0) {
      await msg.edit({
        embeds: [
          new EmbedBuilder()
            .setColor(0x99AAB5)
            .setTitle('⚔️ Challenge Expired')
            .setDescription(`**${host}**'s challenge went unanswered.`)
            .setFooter({ text: 'Run /rps to issue a new challenge.' }),
        ],
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('rps_accept')
              .setLabel('Challenge Expired')
              .setEmoji('🚫')
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(true)
          ),
        ],
      });
    }
  });
}

// ── Command: /bep20 ───────────────────────────────────────────

async function handleBep20(interaction) {
  await interaction.deferReply();

  const wallet = process.env.RECEIVER_WALLET_ADDRESS;
  const amount = interaction.options.getNumber('amount');
  const rpcUrl = process.env.BSC_RPC_URL ?? 'https://bsc-dataseed.binance.org/';

  if (!wallet || !ethers.isAddress(wallet)) {
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xED4245)
          .setTitle('❌ Wallet Not Configured')
          .setDescription('The receiver wallet address is not configured. Contact the server admin.')
          .setFooter({ text: 'Admin: set the RECEIVER_WALLET_ADDRESS environment secret.' }),
      ],
    });
    return;
  }

  let qrBuffer;
  try {
    qrBuffer = await QRCode.toBuffer(wallet, {
      errorCorrectionLevel: 'H',
      width: 300,
      color: { dark: '#000000', light: '#ffffff' },
    });
  } catch (err) {
    console.error('QR generation error:', err);
    await interaction.editReply('❌ Failed to generate QR code. Please try again.');
    return;
  }

  const attachment = new AttachmentBuilder(qrBuffer, { name: 'payment-qr.png' });

  const pendingEmbed = new EmbedBuilder()
    .setColor(0x26A17B)
    .setTitle('💵 USDT Payment Request')
    .setDescription(
      `Send exactly **${amount} USDT** (BEP20) on **BNB Smart Chain** to the address below.\n\n` +
      `> ⚠️ Only send **BEP20 USDT** — sending on the wrong network will result in lost funds.`
    )
    .addFields(
      { name: '📬 Wallet Address', value: `\`${wallet}\``,           inline: false },
      { name: '💰 Amount',         value: `**${amount} USDT**`,      inline: true  },
      { name: '🔗 Network',        value: '**BSC (BEP20)**',         inline: true  },
      { name: '⏳ Status',          value: '`Awaiting payment...`',   inline: false },
    )
    .setImage('attachment://payment-qr.png')
    .setTimestamp()
    .setFooter({ text: `Monitoring expires in 15 min • Requested by ${interaction.user.username}` });

  const copyRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('copy_wallet')
      .setLabel('Copy Wallet Address 📋')
      .setStyle(ButtonStyle.Secondary)
  );

  await interaction.editReply({ embeds: [pendingEmbed], files: [attachment], components: [copyRow] });

  // ── Connect to BSC ────────────────────────────────────────
  let provider;
  try {
    provider = new ethers.JsonRpcProvider(rpcUrl);
    await provider.getBlockNumber();
  } catch (err) {
    console.error('BSC RPC connection error:', err);
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xED4245)
          .setTitle('❌ Network Error')
          .setDescription('Could not connect to the BSC network. Please try again later.')
          .addFields({ name: '📬 Address', value: `\`${wallet}\``, inline: false }),
      ],
      files: [],
    });
    return;
  }

  const usdtContract = new ethers.Contract(USDT_BSC_ADDRESS, ERC20_ABI, provider);
  const amountWei    = ethers.parseUnits(Number(amount).toFixed(6), USDT_DECIMALS);
  const startBlock   = await provider.getBlockNumber();
  const startTime    = Date.now();

  // ── Poll for incoming USDT Transfer ───────────────────────
  const pollTimer = setInterval(async () => {

    // Timeout — expire the request after 15 minutes
    if (Date.now() - startTime > PAYMENT_TIMEOUT) {
      clearInterval(pollTimer);
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x99AAB5)
            .setTitle('⏱️ Payment Request Expired')
            .setDescription(`No payment of **${amount} USDT** was detected within 15 minutes.`)
            .addFields(
              { name: '📬 Address', value: `\`${wallet}\``,     inline: false },
              { name: '💰 Amount',  value: `**${amount} USDT**`, inline: true  },
            )
            .setFooter({ text: 'Run /bep20 again to create a new request.' }),
        ],
        files: [],
      }).catch(() => {});
      return;
    }

    // Check for matching Transfer events since start block
    try {
      const currentBlock = await provider.getBlockNumber();
      if (currentBlock <= startBlock) return;
      const filter = usdtContract.filters.Transfer(null, wallet);
      const events  = await usdtContract.queryFilter(filter, startBlock, currentBlock);

      for (const event of events) {
        if (event.args.value >= amountWei) {
          clearInterval(pollTimer);

          const txHash  = event.transactionHash;
          const from    = event.args.from;
          const bscScan = `https://bscscan.com/tx/${txHash}`;

          const gif = await fetchAnimuGif('https://nekos.best/api/v2/wink?amount=1').catch(() => null);
          const successEmbed = new EmbedBuilder()
            .setColor(0x57F287)
            .setTitle('✅ Payment Confirmed!')
            .setDescription(
              `**${amount} USDT** has been received on BSC!\n\n` +
              `[🔎 View on BscScan](${bscScan})`
            )
            .addFields(
              { name: '📬 To',      value: `\`${wallet}\``,      inline: false },
              { name: '📤 From',    value: `\`${from}\``,         inline: false },
              { name: '💰 Amount',  value: `**${amount} USDT**`,  inline: true  },
              { name: '🔗 Network', value: '**BSC (BEP20)**',     inline: true  },
              { name: '🔎 Tx Hash', value: `\`${txHash}\``,       inline: false },
            )
            .setTimestamp()
            .setFooter({ text: `Confirmed • Requested by ${interaction.user.username}` });

          if (gif) successEmbed.setImage(gif);

          await interaction.editReply({ embeds: [successEmbed], files: [] }).catch(() => {});
          return;
        }
      }
    } catch (err) {
      console.error('BSC polling error:', err);
    }

  }, POLL_INTERVAL);
}

// ── Command: /bep20history ────────────────────────────────────

async function handleBep20History(interaction) {
  await interaction.deferReply();

  const wallet = process.env.RECEIVER_WALLET_ADDRESS;
  const rpcUrl = process.env.BSC_RPC_URL;
  const limit  = interaction.options.getInteger('limit') ?? 5;

  if (!wallet || !rpcUrl) {
    await interaction.editReply('❌ Payment system is not configured. Contact the server admin.');
    return;
  }

  let provider;
  try {
    provider = new ethers.JsonRpcProvider(rpcUrl);
    await provider.getBlockNumber();
  } catch {
    await interaction.editReply('API is currently down, please try again later.');
    return;
  }

  try {
    const currentBlock = await provider.getBlockNumber();
    const LOOKBACK     = 5000; // ~4 hours on BSC at ~3 s/block
    const fromBlock    = Math.max(0, currentBlock - LOOKBACK);

    const usdtContract = new ethers.Contract(USDT_BSC_ADDRESS, ERC20_ABI, provider);
    const filter       = usdtContract.filters.Transfer(null, wallet);
    const events       = await usdtContract.queryFilter(filter, fromBlock, currentBlock);

    const shortWallet = `${wallet.slice(0, 6)}…${wallet.slice(-4)}`;
    const hoursBack   = Math.round((LOOKBACK * 3) / 3600);

    if (events.length === 0) {
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x99AAB5)
            .setTitle('📋 Payment History')
            .setDescription(
              `No USDT received in the last ~${hoursBack} hours.\n\n` +
              `> Wallet: \`${wallet}\``
            )
            .setFooter({ text: 'BNB Smart Chain (BEP20)' }),
        ],
      });
      return;
    }

    const recent = [...events].reverse().slice(0, limit);

    const embed = new EmbedBuilder()
      .setColor(0x26A17B)
      .setTitle('📋 Recent USDT Payments Received')
      .setDescription(
        `**${recent.length}** of **${events.length}** transaction(s) found in the last ~${hoursBack} hours.\n` +
        `Wallet: \`${shortWallet}\``
      )
      .setFooter({ text: 'BNB Smart Chain (BEP20) • Amounts in USDT' })
      .setTimestamp();

    for (const event of recent) {
      const amount    = parseFloat(ethers.formatUnits(event.args.value, USDT_DECIMALS));
      const txHash    = event.transactionHash;
      const from      = event.args.from;
      const shortFrom = `${from.slice(0, 6)}…${from.slice(-4)}`;
      const shortTx   = `${txHash.slice(0, 8)}…${txHash.slice(-6)}`;

      embed.addFields({
        name:   `💰 ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 })} USDT`,
        value:  `From: \`${shortFrom}\`\n[${shortTx}](https://bscscan.com/tx/${txHash})`,
        inline: true,
      });
    }

    await interaction.editReply({ embeds: [embed] });

  } catch (err) {
    console.error('bep20history error:', err);
    await interaction.editReply('API is currently down, please try again later.');
  }
}

// ── Command: /tictactoe ───────────────────────────────────────

async function handleTictactoe(interaction) {
  const host = interaction.user;

  const lobbyEmbed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('⬜ Open Tic-Tac-Toe Challenge')
    .setDescription(`**${host}** wants to play Tic-Tac-Toe!\n\nPress **Accept** to be their opponent.`)
    .setFooter({ text: 'Challenge expires in 2 minutes.' })
    .setTimestamp();

  const acceptRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ttt_accept')
      .setLabel('Accept Challenge')
      .setEmoji('✏️')
      .setStyle(ButtonStyle.Success)
  );

  const msg = await interaction.reply({
    embeds: [lobbyEmbed],
    components: [acceptRow],
    fetchReply: true,
  });

  const acceptCollector = msg.createMessageComponentCollector({
    componentType: ComponentType.Button,
    filter: (i) => i.customId === 'ttt_accept' && i.user.id !== host.id,
    max: 1,
    time: COLLECTOR_TIMEOUT,
  });

  acceptCollector.on('collect', async (acceptInteraction) => {
    const challenger = acceptInteraction.user;
    const board      = Array(9).fill('');
    const players    = { X: host, O: challenger };
    let currentPlayer = host; // host is always X and goes first

    const symbols = { [host.id]: 'X', [challenger.id]: 'O' };

    const turnEmbed = () =>
      new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('⬜ Tic-Tac-Toe')
        .setDescription(
          `**${players.X}** ❌  vs  **${players.O}** ⭕\n\n` +
          `It's **${currentPlayer}**'s turn!`
        )
        .setFooter({ text: 'Click an empty square to place your mark.' })
        .setTimestamp();

    await acceptInteraction.update({
      embeds: [turnEmbed()],
      components: buildTttRows(board),
    });

    const gameCollector = msg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      filter: (i) =>
        i.customId.startsWith('ttt_') &&
        i.customId !== 'ttt_accept' &&
        (i.user.id === host.id || i.user.id === challenger.id),
      time: COLLECTOR_TIMEOUT,
    });

    gameCollector.on('collect', async (moveInteraction) => {
      if (moveInteraction.user.id !== currentPlayer.id) {
        await moveInteraction.reply({ content: "⚠️ It's not your turn!", ephemeral: true });
        return;
      }

      const idx = parseInt(moveInteraction.customId.replace('ttt_', ''), 10);
      if (board[idx] !== '') {
        await moveInteraction.reply({ content: '⚠️ That cell is already taken!', ephemeral: true });
        return;
      }

      board[idx] = symbols[currentPlayer.id];

      const winner  = checkTttWinner(board);
      const isFull  = board.every((cell) => cell !== '');

      if (winner) {
        gameCollector.stop('winner');
        const winnerUser  = players[winner];
        const winnerEmoji = winner === 'X' ? '❌' : '⭕';
        const victoryEmbed = await buildVictoryEmbed(
          winnerUser,
          `${winnerEmoji} ${winnerUser.username} Wins!`,
          `**${winnerUser}** wins the Tic-Tac-Toe match!\n\n` +
          `**${players.X}** ❌  vs  **${players.O}** ⭕`
        );
        await moveInteraction.update({
          embeds: [victoryEmbed],
          components: buildTttRows(board, true),
        });
        return;
      }

      if (isFull) {
        gameCollector.stop('draw');
        await moveInteraction.update({
          embeds: [
            new EmbedBuilder()
              .setColor(0xFEE75C)
              .setTitle("🤝 It's a Draw!")
              .setDescription(
                `**${players.X}** ❌  vs  **${players.O}** ⭕\n\n` +
                `No moves left — perfectly matched!`
              )
              .setFooter({ text: 'Run /tictactoe to play again.' })
              .setTimestamp(),
          ],
          components: buildTttRows(board, true),
        });
        return;
      }

      // Advance to the next player's turn
      currentPlayer = currentPlayer.id === host.id ? challenger : host;
      await moveInteraction.update({
        embeds: [turnEmbed()],
        components: buildTttRows(board),
      });
    });

    gameCollector.on('end', async (_, reason) => {
      if (reason === 'time') {
        await msg.edit({
          embeds: [
            new EmbedBuilder()
              .setColor(0x99AAB5)
              .setTitle('⏱️ Game Timed Out')
              .setDescription('A player took too long. The match has been cancelled.')
              .setFooter({ text: 'Run /tictactoe to start a new game.' }),
          ],
          components: buildTttRows(board, true),
        }).catch(() => {});
      }
    });
  });

  acceptCollector.on('end', async (collected) => {
    if (collected.size === 0) {
      await msg.edit({
        embeds: [
          new EmbedBuilder()
            .setColor(0x99AAB5)
            .setTitle('⬜ Challenge Expired')
            .setDescription(`**${host}**'s Tic-Tac-Toe challenge went unanswered.`)
            .setFooter({ text: 'Run /tictactoe to issue a new challenge.' }),
        ],
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('ttt_accept')
              .setLabel('Challenge Expired')
              .setEmoji('🚫')
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(true)
          ),
        ],
      }).catch(() => {});
    }
  });
}

// ── Interaction Router ────────────────────────────────────────

client.on('interactionCreate', async (interaction) => {
  console.log(`[interaction] type=${interaction.type} isChatInput=${interaction.isChatInputCommand()} name=${interaction.commandName ?? 'n/a'}`);

  // ── Button handler ─────────────────────────────────────────
  if (interaction.isButton()) {
    try {
      const customId = interaction.customId;

      // ── Copy Wallet ────────────────────────────────────────
      if (customId === 'copy_wallet') {
        const wallet = process.env.RECEIVER_WALLET_ADDRESS ?? 'Not configured';
        await interaction.reply({ content: wallet, ephemeral: true });
        return;
      }

      // ── Return Actions (return_kiss / return_pat / return_hug)
      if (customId.startsWith('return_')) {
        const [action, originalSenderId, originalTargetId] = customId.split(':');
        const cmd = action.replace('return_', '');

        if (interaction.user.id !== originalTargetId) {
          await interaction.reply({ content: "This button isn't for you!", ephemeral: true });
          return;
        }

        const cfg    = ACTION_CONFIG[cmd];
        const sender = interaction.user;
        const target = await interaction.client.users.fetch(originalSenderId).catch(() => null);

        if (!target) {
          await interaction.reply({ content: '❌ Could not find the original user.', ephemeral: true });
          return;
        }

        await interaction.deferReply();

        let gif;
        try {
          gif = await fetchAnimuGif(cfg.apiUrl);
        } catch (err) {
          console.error('Return action API error:', err);
          await interaction.editReply({ content: 'API is currently down, please try again later.' });
          return;
        }

        const returnEmbed = new EmbedBuilder()
          .setColor(cfg.color)
          .setTitle(`${cfg.emoji} ${cmd.charAt(0).toUpperCase() + cmd.slice(1)} Back!`)
          .setDescription(`**${sender}** ${cfg.verb} **${target}** back — ${cfg.suffix}`)
          .setImage(gif)
          .setTimestamp()
          .setFooter({ text: cfg.footer });

        await interaction.editReply({ embeds: [returnEmbed] });
        return;
      }

      // All other buttons (rps/ttt) are handled by their own collectors — ignore here
    } catch (err) {
      console.error('Button handler error:', err);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: '❌ Something went wrong.', ephemeral: true }).catch(() => {});
      }
    }
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  try {
    switch (interaction.commandName) {
      case 'bep20':        return await handleBep20(interaction);
      case 'bep20history': return await handleBep20History(interaction);
      case 'math':      return await handleMath(interaction);
      case 'currency':  return await handleCurrency(interaction);
      case 'hug':
      case 'pat':
      case 'slap':
      case 'kick':
      case 'kiss':
      case 'wink':
      case 'glare':     return await handleAction(interaction);
      case 'rps':       return await handleRps(interaction);
      case 'tictactoe': return await handleTictactoe(interaction);
      default: break;
    }
  } catch (err) {
    console.error(`Error in /${interaction.commandName}:`, err);
    const errMsg = { content: '❌ Something went wrong. Please try again.', ephemeral: true };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(errMsg).catch(() => {});
    } else {
      await interaction.reply(errMsg).catch(() => {});
    }
  }
});

// ── Client Ready ──────────────────────────────────────────────

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