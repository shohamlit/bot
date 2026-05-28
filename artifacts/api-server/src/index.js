import 'dotenv/config';
import {
  Client,
  GatewayIntentBits,
  ActivityType,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} from 'discord.js';

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

// Map each action command to its some-random-api endpoint and display config
const ACTION_CONFIG = {
  hug:   { endpoint: 'hug',   color: 0xFF69B4, emoji: '🤗', verb: 'wraps',         suffix: 'in a warm hug!',             footer: 'Spreading the love ❤️'  },
  pat:   { endpoint: 'pat',   color: 0x7ED56F, emoji: '👋', verb: 'gives',          suffix: 'a gentle pat on the head!',  footer: 'So sweet! 🌸'           },
  slap:  { endpoint: 'slap',  color: 0xFF4500, emoji: '👋', verb: 'slaps',          suffix: 'right across the face!',     footer: 'They had it coming 💀'  },
  kick:  { endpoint: 'punch', color: 0xC0392B, emoji: '🦵', verb: 'kicks',          suffix: 'into next week!',            footer: 'Boots of justice 👟'    },
  kiss:  { endpoint: 'kiss',  color: 0xFF1493, emoji: '💋', verb: 'plants a kiss on', suffix: '\'s cheek! 😘',           footer: 'Caught in 4K 💕'        },
  wink:  { endpoint: 'wink',  color: 0x9B59B6, emoji: '😉', verb: 'gives',          suffix: 'a cheeky wink!',             footer: 'Say less 😏'            },
  glare: { endpoint: 'stare', color: 0x2C3E50, emoji: '😒', verb: 'glares intensely at', suffix: '.',                    footer: 'Tension level: maximum 🧊' },
};

// ── Helpers ───────────────────────────────────────────────────

async function fetchAnimuGif(endpoint) {
  const res  = await fetch(`https://some-random-api.com/animu/${endpoint}`);
  const data = await res.json();
  return data.link;
}

async function buildVictoryEmbed(winner, title, description) {
  const gif   = await fetchAnimuGif('wink').catch(() => null);
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
          .setDescription(err.message)
          .setFooter({ text: 'Example: (5^2 + 10) / 2' }),
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
        .setTitle('🧮 Math Result')
        .addFields(
          { name: 'Expression', value: `\`${expression}\``, inline: false },
          { name: 'Result',     value: `\`\`\`${formatted}\`\`\``,   inline: false },
        )
        .setFooter({ text: 'Use ^ for exponentiation, % for modulo' }),
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
    const res = await fetch(`https://open.er-api.com/v6/latest/${from}`);
    data = await res.json();
  } catch {
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xED4245)
          .setTitle('❌ Network Error')
          .setDescription('Could not reach the exchange rate API. Please try again.'),
      ],
    });
    return;
  }

  if (data.result === 'error') {
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xED4245)
          .setTitle('❌ Unknown Currency')
          .setDescription(`**${from}** is not a valid currency code.\nUse standard 3-letter codes like \`USD\`, \`EUR\`, \`GBP\`, \`INR\`.`),
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
          .setTitle('❌ Unknown Currency')
          .setDescription(`**${to}** is not a valid currency code.\nUse standard 3-letter codes like \`USD\`, \`EUR\`, \`GBP\`, \`INR\`.`),
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
        .addFields(
          { name: 'Amount',    value: `**${amount.toLocaleString()} ${from}**`,          inline: true  },
          { name: 'Converted', value: `**${converted} ${to}**`,                          inline: true  },
          { name: 'Rate',      value: `\`1 ${from} = ${rateFormatted} ${to}\``,          inline: false },
        )
        .setFooter({ text: `Rates updated: ${updatedAt}` }),
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
    gif = await fetchAnimuGif(cfg.endpoint);
  } catch {
    await interaction.editReply({ content: '❌ Could not fetch a GIF right now. Try again!' });
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(cfg.color)
    .setTitle(`${cfg.emoji} ${cmd.charAt(0).toUpperCase() + cmd.slice(1)}!`)
    .setDescription(`**${sender}** ${cfg.verb} **${target}** ${cfg.suffix}`)
    .setImage(gif)
    .setFooter({ text: cfg.footer });

  await interaction.editReply({ embeds: [embed] });
}

// ── Command: /rps ─────────────────────────────────────────────

async function handleRps(interaction) {
  const host = interaction.user;

  const lobbyEmbed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('⚔️ OPEN CHALLENGE ISSUED ⚔️')
    .setDescription(`**${host}** is waiting for a challenger!\n\nPress **Accept Challenge** to enter the arena!`)
    .setFooter({ text: 'First to accept takes the fight.' });

  const acceptRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('rps_accept')
      .setLabel('Accept Challenge')
      .setEmoji('✔️')
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
      .setTitle('🥊 Rock • Paper • Scissors')
      .setDescription(
        `**${host}** vs **${challenger}**\n\n` +
        `Both players — choose your weapon! Your choice is **secret** until both have moved.`
      )
      .addFields(
        { name: host.username,       value: '❓ Choosing…', inline: true },
        { name: challenger.username, value: '❓ Choosing…', inline: true },
      )
      .setFooter({ text: 'Click a button below to lock in your move.' });

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
        content: `🤫 **${RPS_EMOJI[move]} ${move}** locked in! Waiting for your opponent…`,
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
              .setDescription('No result — both players must choose within 2 minutes.'),
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
              .setDescription(`Both chose **${RPS_EMOJI[hostMove]} ${hostMove}**. No winner this time!`)
              .addFields(
                { name: host.username,       value: `${RPS_EMOJI[hostMove]} ${hostMove}`,             inline: true },
                { name: challenger.username, value: `${RPS_EMOJI[challengerMove]} ${challengerMove}`, inline: true },
              ),
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
        '🏆 VICTORY!',
        `**${winner}** wins!\n\n` +
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
            .setDescription(`**${host}**'s challenge expired — no one accepted.`),
        ],
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('rps_accept')
              .setLabel('Challenge Expired')
              .setEmoji('✔️')
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(true)
          ),
        ],
      });
    }
  });
}

// ── Command: /tictactoe ───────────────────────────────────────

async function handleTictactoe(interaction) {
  const host = interaction.user;

  const lobbyEmbed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('⚔️ OPEN CHALLENGE ISSUED ⚔️')
    .setDescription(`**${host}** is waiting for a challenger!\n\nPress **Accept Challenge** to enter the arena!`)
    .setFooter({ text: 'First to accept takes the fight.' });

  const acceptRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ttt_accept')
      .setLabel('Accept Challenge')
      .setEmoji('✔️')
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
    const challenger  = acceptInteraction.user;
    const board       = Array(9).fill('');
    const players     = { X: host, O: challenger };
    let   currentMark = 'X';

    function buildGameEmbed(statusLine) {
      return new EmbedBuilder()
        .setColor(currentMark === 'X' ? 0xED4245 : 0x5865F2)
        .setTitle('❌ Tic-Tac-Toe ⭕')
        .setDescription(
          `**${players.X}** ❌  vs  ⭕ **${players.O}**\n\n` +
          (statusLine ?? `It's **${players[currentMark]}'s** turn (${currentMark})`)
        );
    }

    await acceptInteraction.update({
      embeds: [buildGameEmbed()],
      components: buildTttRows(board),
    });

    const gameCollector = msg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      filter: (i) => i.customId.startsWith('ttt_') && i.customId !== 'ttt_accept',
      time: COLLECTOR_TIMEOUT,
    });

    gameCollector.on('collect', async (btnInteraction) => {
      if (btnInteraction.user.id !== players[currentMark].id) {
        await btnInteraction.reply({ content: `⛔ It's not your turn!`, ephemeral: true });
        return;
      }
      const idx = parseInt(btnInteraction.customId.split('_')[1]);
      if (board[idx] !== '') {
        await btnInteraction.reply({ content: '⚠️ That square is already taken!', ephemeral: true });
        return;
      }

      board[idx]     = currentMark;
      const winner   = checkTttWinner(board);
      const isDraw   = !winner && board.every((v) => v !== '');

      if (winner) {
        gameCollector.stop('win');
        const winPlayer    = players[winner];
        const victoryEmbed = await buildVictoryEmbed(
          winPlayer,
          `🏆 ${winPlayer.username} WINS!`,
          `**${winPlayer}** has conquered the grid with **${winner}**s!\n\nGG WP! 🎉`
        );
        await btnInteraction.update({ embeds: [victoryEmbed], components: buildTttRows(board, true) });

      } else if (isDraw) {
        gameCollector.stop('draw');
        await btnInteraction.update({
          embeds: [
            new EmbedBuilder()
              .setColor(0xFEE75C)
              .setTitle("🤝 It's a Draw!")
              .setDescription(`**${players.X}** and **${players.O}** fought to a stalemate!\n\nNo winner this time.`),
          ],
          components: buildTttRows(board, true),
        });

      } else {
        currentMark = currentMark === 'X' ? 'O' : 'X';
        await btnInteraction.update({
          embeds: [buildGameEmbed()],
          components: buildTttRows(board),
        });
      }
    });

    gameCollector.on('end', async (_, reason) => {
      if (reason === 'time') {
        await msg.edit({
          embeds: [
            new EmbedBuilder()
              .setColor(0x99AAB5)
              .setTitle('⏱️ Game Timed Out')
              .setDescription('The game ended due to inactivity.'),
          ],
          components: buildTttRows(board, true),
        });
      }
    });
  });

  acceptCollector.on('end', async (collected) => {
    if (collected.size === 0) {
      await msg.edit({
        embeds: [
          new EmbedBuilder()
            .setColor(0x99AAB5)
            .setTitle('⚔️ Challenge Expired')
            .setDescription(`**${host}**'s challenge expired — no one accepted.`),
        ],
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('ttt_accept')
              .setLabel('Challenge Expired')
              .setEmoji('✔️')
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(true)
          ),
        ],
      });
    }
  });
}

// ── Interaction Router ────────────────────────────────────────

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  try {
    switch (interaction.commandName) {
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
