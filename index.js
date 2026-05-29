// ============================================================
//  BEP20 USDT Payment Bot  –  index.js
//  Stack: discord.js v14 · ethers.js v6 · qrcode
// ============================================================

require('dotenv').config();
const express = require('express');
const app = express();
const port = process.env.PORT || 10000;

app.listen(port, '0.0.0.0', () => {
    console.log(`Health server listening on port ${port}`);
});

const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  AttachmentBuilder,
} = require('discord.js');
const { ethers } = require('ethers');
const QRCode  = require('qrcode');

// ── Environment Variables ────────────────────────────────────
const DISCORD_TOKEN        = process.env.DISCORD_TOKEN;
const BSC_RPC_URL          = process.env.BSC_RPC_URL;
const RECEIVER_WALLET      = process.env.RECEIVER_WALLET_ADDRESS;

// ── Constants ────────────────────────────────────────────────
// BEP20 USDT on Binance Smart Chain
const USDT_CONTRACT_ADDRESS = '0x55d398326f99059fF775485246999027B3197955';
// USDT on BSC has 18 decimals (unlike Ethereum's 6)
const USDT_DECIMALS         = 18;
// Timeout before the bot stops listening for a payment (15 minutes)
const PAYMENT_TIMEOUT_MS    = 15 * 60 * 1000;

// Minimal ABI – we only need the Transfer event
const ERC20_ABI = [
  'event Transfer(address indexed from, address indexed to, uint256 value)',
];

// ── Discord Client ───────────────────────────────────────────
// We only need the default gateway intents; DMs work without extra intents
const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

// ── Bot Ready ────────────────────────────────────────────────
client.once('ready', () => {
  console.log(`✅  Logged in as ${client.user.tag}`);
});

// ── Helper: Generate QR Code Buffer ─────────────────────────
/**
 * Builds a "binance pay"-style URI and returns a PNG buffer.
 * The URI encodes both the wallet address and the expected amount,
 * so most crypto wallets can pre-fill the fields when scanned.
 *
 * @param {string} address  - Receiver wallet address
 * @param {number} amount   - USDT amount requested
 * @returns {Promise<Buffer>}
 */
async function generateQrBuffer(address, amount) {
  // A simple URI scheme understood by many BSC-compatible wallets
  const uri = `ethereum:${address}@56/transfer?address=${USDT_CONTRACT_ADDRESS}&uint256=${amount}`;

  return QRCode.toBuffer(uri, {
    errorCorrectionLevel: 'H',   // High redundancy – survives minor distortion
    type            : 'png',
    width           : 400,
    margin          : 2,
    color: {
      dark : '#000000',
      light: '#FFFFFF',
    },
  });
}

// ── Helper: Build the "Awaiting Payment" Embed ───────────────
/**
 * Returns a gold-coloured embed shown while waiting for payment.
 *
 * @param {number} amount     - USDT amount
 * @param {string} wallet     - Receiver wallet address
 * @returns {EmbedBuilder}
 */
function buildPendingEmbed(amount, wallet) {
  return new EmbedBuilder()
    .setColor(0xF0B90B)                          // Binance yellow
    .setTitle('⏳  Awaiting Payment')
    .setDescription(
      'Scan the QR code with your wallet app **or** send manually to the address below.\n\n' +
      '> The bot will automatically confirm once the transaction is detected on-chain.'
    )
    .addFields(
      { name: '💵  Amount (USDT)',      value: `\`${amount} USDT\``,   inline: true  },
      { name: '🌐  Network',            value: '`BNB Smart Chain`',    inline: true  },
      { name: '📥  Receiving Address',  value: `\`\`\`${wallet}\`\`\`` },
    )
    .setImage('attachment://qrcode.png')         // References the attached file
    .setFooter({ text: 'This request expires in 15 minutes.' })
    .setTimestamp();
}

// ── Helper: Build the "Payment Confirmed" Embed ──────────────
/**
 * Returns a green embed shown after a matching transfer is detected.
 *
 * @param {number} amount   - USDT amount
 * @param {string} txHash   - Transaction hash on BSC
 * @returns {EmbedBuilder}
 */
function buildConfirmedEmbed(amount, txHash) {
  const bscScanLink = `https://bscscan.com/tx/${txHash}`;

  return new EmbedBuilder()
    .setColor(0x00C851)                          // Green
    .setTitle('✅  Payment Confirmed!')
    .setDescription(`Your payment of **${amount} USDT** has been received and confirmed on the Binance Smart Chain.`)
    .addFields(
      { name: '💵  Amount Received',  value: `\`${amount} USDT\``,                                   inline: true },
      { name: '🌐  Network',          value: '`BNB Smart Chain`',                                    inline: true },
      { name: '🔗  Transaction Hash', value: `[View on BscScan](${bscScanLink})\n\`${txHash}\`` },
    )
    .setFooter({ text: 'Thank you for your payment!' })
    .setTimestamp();
}

// ── Helper: Build the "Expired" Embed ───────────────────────
function buildExpiredEmbed(amount) {
  return new EmbedBuilder()
    .setColor(0xFF4444)
    .setTitle('⌛  Payment Request Expired')
    .setDescription(
      `No payment of **${amount} USDT** was detected within 15 minutes.\n\n` +
      'Please run `/bep20 qr` again to generate a new request.'
    )
    .setTimestamp();
}

// ── Slash Command Handler ────────────────────────────────────
client.on('interactionCreate', async (interaction) => {
  // Only handle our specific command
  if (!interaction.isChatInputCommand()) return;
      if (interaction.commandName === 'hug') {
        await interaction.deferReply(); 
        try {
            const target = interaction.options.getUser('target');
            const gif = await fetchAnimuGif('https://nekos.best/api/v2/hug');
            const embed = new EmbedBuilder().setTitle('💖 Warm Hugs!').setDescription(`*<@${interaction.user.id}> wraps <@${target.id}> in a cozy hug.*`).setImage(gif).setColor('#FFAAA5').setFooter({ text: 'Everyone needs a hug sometimes' });
            await interaction.editReply({ embeds: [embed] });
        } catch (error) { await interaction.editReply({ content: 'API is napping! 💤' }); }
    }

    if (interaction.commandName === 'pat') {
        await interaction.deferReply(); 
        try {
            const target = interaction.options.getUser('target');
            const gif = await fetchAnimuGif('https://nekos.best/api/v2/pat');
            const embed = new EmbedBuilder().setTitle('🌸 Headpats!').setDescription(`*There, there... <@${interaction.user.id}> gently pats <@${target.id}>'s head.*`).setImage(gif).setColor('#FFD3B6');
            await interaction.editReply({ embeds: [embed] });
        } catch (error) { await interaction.editReply({ content: 'API is napping! 💤' }); }
    }

    if (interaction.commandName === 'slap') {
        await interaction.deferReply(); 
        try {
            const target = interaction.options.getUser('target');
            const gif = await fetchAnimuGif('https://nekos.best/api/v2/slap');
            const embed = new EmbedBuilder().setTitle('💥 OUCH!').setDescription(`*<@${interaction.user.id}> slapped <@${target.id}>!*`).setImage(gif).setColor('#FF8C94');
            await interaction.editReply({ embeds: [embed] });
        } catch (error) { await interaction.editReply({ content: 'API is napping! 💤' }); }
    }

    if (interaction.commandName === 'wink') {
        await interaction.deferReply(); 
        try {
            const target = interaction.options.getUser('target');
            const gif = await fetchAnimuGif('https://nekos.best/api/v2/wink');
            const embed = new EmbedBuilder().setTitle('✨ Cheeky!').setDescription(`*<@${interaction.user.id}> winks at <@${target.id}>.* 😉`).setImage(gif).setColor('#FCEFC8');
            await interaction.editReply({ embeds: [embed] });
        } catch (error) { await interaction.editReply({ content: 'API is napping! 💤' }); }
    }

    if (interaction.commandName === 'kiss') {
        await interaction.deferReply(); 
        try {
            const target = interaction.options.getUser('target');
            const gif = await fetchAnimuGif('https://nekos.best/api/v2/kiss');
            const embed = new EmbedBuilder().setTitle('💕 Smooch!').setDescription(`*<@${interaction.user.id}> kisses <@${target.id}>!*`).setImage(gif).setColor('#F686BD');
            await interaction.editReply({ embeds: [embed] });
        } catch (error) { await interaction.editReply({ content: 'API is napping! 💤' }); }
    }

    if (interaction.commandName === 'kick') {
        await interaction.deferReply(); 
        try {
            const target = interaction.options.getUser('target');
            const gif = await fetchAnimuGif('https://nekos.best/api/v2/kick');
            const embed = new EmbedBuilder().setTitle('🥋 HYAAH!').setDescription(`*<@${interaction.user.id}> kicks <@${target.id}>!*`).setImage(gif).setColor('#D9534F');
            await interaction.editReply({ embeds: [embed] });
        } catch (error) { await interaction.editReply({ content: 'API is napping! 💤' }); }
    }

    if (interaction.commandName === 'glare') {
        await interaction.deferReply(); 
        try {
            const target = interaction.options.getUser('target');
            const gif = await fetchAnimuGif('https://nekos.best/api/v2/stare');
            const embed = new EmbedBuilder().setTitle('👀 Stare...').setDescription(`*<@${interaction.user.id}> glares at <@${target.id}>...*`).setImage(gif).setColor('#2C3E50');
            await interaction.editReply({ embeds: [embed] });
        } catch (error) { await interaction.editReply({ content: 'API is napping! 💤' }); }
    }
  
  if (interaction.commandName !== 'bep20') return;

  // ── 1. Parse the requested amount ──────────────────────────
  const amount = interaction.options.getNumber('amount');

  if (!amount || amount <= 0) {
    return interaction.reply({
      content: '❌  Please provide a valid positive USDT amount.',
      ephemeral: true,
    });
  }

  // ── 2. Generate QR code ────────────────────────────────────
  let qrBuffer;
  try {
    qrBuffer = await generateQrBuffer(RECEIVER_WALLET, amount);
  } catch (err) {
    console.error('QR generation failed:', err);
    return interaction.reply({
      content: '❌  Failed to generate QR code. Please try again.',
      ephemeral: true,
    });
  }

  // Wrap the buffer so Discord can attach it to the embed
  const qrAttachment = new AttachmentBuilder(qrBuffer, { name: 'qrcode.png' });

  // ── 3. Send the initial "Awaiting Payment" embed ───────────
  // We use `ephemeral: false` so the message is a real DM message we can edit later.
  // Note: The interaction itself is deferred so we get a message object back.
  await interaction.deferReply();

  let sentMessage;
  try {
    sentMessage = await interaction.editReply({
      embeds : [buildPendingEmbed(amount, RECEIVER_WALLET)],
      files  : [qrAttachment],
    });
  } catch (err) {
    console.error('Failed to send embed:', err);
    return interaction.editReply({ content: '❌  Could not send payment embed. Make sure DMs are enabled.' });
  }

  // ── 4. Connect to BSC and watch for the Transfer event ─────
  let provider;
  try {
    provider = new ethers.JsonRpcProvider(BSC_RPC_URL);
    // Verify the connection works before we start listening
    await provider.getBlockNumber();
    console.log(`🔗  Connected to BSC RPC. Watching for ${amount} USDT → ${RECEIVER_WALLET}`);
  } catch (err) {
    console.error('BSC RPC connection failed:', err);
    return interaction.editReply({
      content : '❌  Could not connect to the BSC network. Please try again later.',
      embeds  : [],
      files   : [],
    });
  }

  // Instantiate the USDT contract
  const usdtContract = new ethers.Contract(USDT_CONTRACT_ADDRESS, ERC20_ABI, provider);

  // Convert the requested amount to the on-chain unit (wei-equivalent)
  const expectedAmountWei = ethers.parseUnits(amount.toString(), USDT_DECIMALS);

  // Build a filter: Transfer events TO our receiver address only
  const transferFilter = usdtContract.filters.Transfer(null, RECEIVER_WALLET);

  // ── 5. Define the event listener ──────────────────────────
  let isResolved = false; // Guard flag – prevents double-resolution

  const onTransfer = async (from, to, value, event) => {
    // Safety check: ignore if already handled
    if (isResolved) return;

    // ── Amount check: must match exactly ──────────────────────
    if (value !== expectedAmountWei) {
      const receivedUsdt = ethers.formatUnits(value, USDT_DECIMALS);
      console.log(`ℹ️  Transfer detected but amount mismatch: got ${receivedUsdt} USDT, expected ${amount} USDT`);
      return; // Keep listening
    }

    // ── Match found! ──────────────────────────────────────────
    isResolved = true;
    const txHash = event.log.transactionHash;
    console.log(`✅  Payment confirmed! TxHash: ${txHash}`);

    // Stop listening immediately
    usdtContract.off(transferFilter, onTransfer);
    clearTimeout(timeoutHandle);

    // Destroy the provider to free up resources
    provider.destroy();

    // Update the original Discord message
    try {
      await interaction.editReply({
        embeds : [buildConfirmedEmbed(amount, txHash)],
        files  : [],   // Remove the QR code image from the confirmed message
      });
    } catch (editErr) {
      console.error('Failed to update embed after confirmation:', editErr);
    }
  };

  // Attach the listener
  usdtContract.on(transferFilter, onTransfer);

  // ── 6. Timeout after 15 minutes ───────────────────────────
  const timeoutHandle = setTimeout(async () => {
    if (isResolved) return; // Payment already confirmed, nothing to do

    isResolved = true;
    console.log(`⌛  Payment request for ${amount} USDT timed out.`);

    // Stop the listener
    usdtContract.off(transferFilter, onTransfer);
    provider.destroy();

    // Update the embed to show the expired state
    try {
      await interaction.editReply({
        embeds : [buildExpiredEmbed(amount)],
        files  : [],
      });
    } catch (editErr) {
      console.error('Failed to update embed on timeout:', editErr);
    }
  }, PAYMENT_TIMEOUT_MS);

}); // end interactionCreate

// ── Start the Bot ────────────────────────────────────────────
client.login(DISCORD_TOKEN).catch((err) => {
  console.error('❌  Failed to log in to Discord:', err.message);
  process.exit(1);
});