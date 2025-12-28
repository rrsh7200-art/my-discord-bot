import "dotenv/config";
import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
} from "discord.js";

import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  NoSubscriberBehavior,
  VoiceConnectionStatus,
  entersState,
} from "@discordjs/voice";

import path from "node:path";
import { fileURLToPath } from "node:url";

// ========================
// إعداد المسارات
// ========================
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WELCOME_FILE = path.join(__dirname, "welcome.mp3");
const MUSIC_FILE = path.join(__dirname, "music.mp3");

// ========================
// تحميل بيانات البيئة
// ========================
const TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const VOICE_CHANNEL_ID = process.env.VOICE_CHANNEL_ID;

// ========================
// إعداد البوت
// ========================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

// ========================
// Audio Players
// ========================
const welcomePlayer = createAudioPlayer({
  behaviors: { noSubscriber: NoSubscriberBehavior.Play },
});

const musicPlayer = createAudioPlayer({
  behaviors: { noSubscriber: NoSubscriberBehavior.Play },
});

// Loop الموسيقى
musicPlayer.on(AudioPlayerStatus.Idle, () => {
  const resource = createAudioResource(MUSIC_FILE, { inlineVolume: true });
  resource.volume.setVolume(0.7);
  musicPlayer.play(resource);
});

let voiceConnection = null;

// ========================
// الإتصال بالروم الصوتي
// ========================
async function connectToVoice() {
  const guild = await client.guilds.fetch(GUILD_ID);
  const channel =
    guild.channels.cache.get(VOICE_CHANNEL_ID) ||
    (await guild.channels.fetch(VOICE_CHANNEL_ID));

  voiceConnection = joinVoiceChannel({
    channelId: channel.id,
    guildId: guild.id,
    adapterCreator: guild.voiceAdapterCreator,
    selfDeaf: true,
    selfMute: false,
  });

  await entersState(voiceConnection, VoiceConnectionStatus.Ready, 20_000);
  console.log("🎧 متصل بالروم الصوتي.");
}

// ========================
// دوال التشغيل
// ========================
function playWelcome() {
  const resource = createAudioResource(WELCOME_FILE, { inlineVolume: true });
  resource.volume.setVolume(1.0);
  voiceConnection.subscribe(welcomePlayer);
  welcomePlayer.play(resource);
}

function startMusic() {
  const resource = createAudioResource(MUSIC_FILE, { inlineVolume: true });
  resource.volume.setVolume(0.7);
  voiceConnection.subscribe(musicPlayer);
  musicPlayer.play(resource);
}

function stopMusic() {
  musicPlayer.stop();
}

function setVolume(value) {
  const vol = value / 100;
  musicPlayer.state.resource?.volume?.setVolume(vol);
  welcomePlayer.state.resource?.volume?.setVolume(vol);
}

// ========================
// Slash Commands
// ========================
const commands = [
  new SlashCommandBuilder()
    .setName("music")
    .setDescription("التحكم بالموسيقى")
    .addSubcommand((sub) =>
      sub.setName("start").setDescription("تشغيل موسيقى الانتظار")
    )
    .addSubcommand((sub) =>
      sub.setName("stop").setDescription("إيقاف موسيقى الانتظار")
    ),

  new SlashCommandBuilder()
    .setName("volume")
    .setDescription("تغيير مستوى الصوت")
    .addIntegerOption((opt) =>
      opt
        .setName("value")
        .setDescription("قيمة الصوت 0 - 100")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("status")
    .setDescription("عرض حالة البوت"),
].map((cmd) => cmd.toJSON());

const rest = new REST({ version: "10" }).setToken(TOKEN);

// ========================
// Register Slash Commands
// ========================
async function registerCommands() {
  await rest.put(Routes.applicationGuildCommands(client.user.id, GUILD_ID), {
    body: commands,
  });
  console.log("✅ تم تسجيل أوامر السلاش.");
}

// ========================
// Event: Bot Ready
// ========================
client.once("ready", async () => {
  console.log(`🚀 Logged in as ${client.user.tag}`);
  await registerCommands();
  await connectToVoice();
});

// ========================
// Event: Member Enters Room (تشغيل الترحيب)
// ========================
client.on("voiceStateUpdate", (oldState, newState) => {
  if (
    newState.channelId === VOICE_CHANNEL_ID &&
    oldState.channelId !== VOICE_CHANNEL_ID &&
    !newState.member.user.bot
  ) {
    playWelcome();
  }
});

// ========================
// Event: Slash Commands
// ========================
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "music") {
    const sub = interaction.options.getSubcommand();
    if (sub === "start") {
      startMusic();
      interaction.reply("🎶 تم تشغيل موسيقى الانتظار.");
    } else if (sub === "stop") {
      stopMusic();
      interaction.reply("⛔ تم إيقاف الموسيقى.");
    }
  }

  if (interaction.commandName === "volume") {
    const value = interaction.options.getInteger("value");
    if (value < 0 || value > 100)
      return interaction.reply("❌ يجب أن يكون الصوت بين 0 و 100.");

    setVolume(value);
    interaction.reply(`🔊 تم تغيير مستوى الصوت إلى ${value}%`);
  }

  if (interaction.commandName === "status") {
    interaction.reply("✨ البوت يعمل بشكل طبيعي.");
  }
});

// ========================
// Login
// ========================
client.login(TOKEN);
