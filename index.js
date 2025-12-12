/**
 * ============================================================
 * BOT: Event Organizer (Anti-Duplicate + Auto-Clean + Single Vote)
 * ============================================================
 */

const express = require('express');
const { 
    Client, 
    GatewayIntentBits, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    Partials, 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle,
    InteractionType 
} = require('discord.js');

// ==========================================
// 1. إعدادات البوت والسيرفر (CONFIG)
// ==========================================
const CONFIG = {
    TOKEN: process.env.TOKEN, 
    
    CHANNELS: {
        PARTICIPANTS: '1448832815658700820' // آيدي روم المشاركات
    },
    ROLES: {
        ADMIN: '1161578341313294427'      // آيدي الرتبة المسموح لها بالتعديل
    },
    
    TEXTS: {
        DESCRIPTION: 
            "**طريقة المشاركة:**\n" +
            "1- اضغط على زر \"تسجيل في المسابقة\".\n" +
            "2- سيتم تسجيل اسمك ونشر مشاركتك في روم مشتركين المسابقة.\n" +
            "3- اطلب من أصدقائك التفاعل مع مشاركتك.\n" +
            "4- الفائز هو صاحب أكبر عدد من التفاعلات.\n\n" +
            "**شروط المسابقة:**\n" +
            "• يمنع استخدام الحسابات الوهمية أو تكرار الحسابات.\n" +
            "• يحق للإدارة استبعاد أي مشاركة تخالف الشروط.",
        DEFAULT_PRIZE: "ملفات السلطان",
        IMAGE_URL: 'https://cdn.discordapp.com/attachments/1439305348174450859/1448836889242112131/28df69b032c2f21898dd80751b61791f.png'
    }
};

// ==========================================
// 2. متغيرات الذاكرة (State)
// ==========================================
let participantCount = 0; 
const participantsData = new Map(); // UserID -> MessageID (للمتسابقين)
const votesData = new Map();        // VoterID -> MessageID (لتتبع المصوتين)

// ==========================================
// 3. السيرفر الوهمي
// ==========================================
const app = express();
app.get('/', (req, res) => res.send('Bot is running properly! 🤖'));
app.listen(3000, () => console.log('🟢 Fake server is ready on port 3000'));

// ==========================================
// 4. تشغيل البوت
// ==========================================
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,         
        GatewayIntentBits.GuildMessageReactions 
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

// --- [حدث التشغيل: Ready] ---
client.once('ready', async () => {
    console.log(`✅ Logged in as ${client.user.tag}`);
    
    try {
        const channel = await client.channels.fetch(CONFIG.CHANNELS.PARTICIPANTS).catch(() => null);
        if (channel) {
            console.log("🔄 جاري فحص البيانات السابقة (عداد + أصوات)...");
            
            // نجلب آخر 50 رسالة
            const messages = await channel.messages.fetch({ limit: 50 });
            let maxNum = 0;

            // نستخدم for...of لدعم العمليات غير المتزامنة داخله
            for (const msg of messages.values()) {
                if (msg.author.id === client.user.id) {
                    
                    // 1. استرجاع العداد
                    const match = msg.content.match(/المتسابق رقم #(\d+)/);
                    if (match) {
                        const num = parseInt(match[1]);
                        if (num > maxNum) maxNum = num;
                    }

                    // 2. تسجيل المصوتين القدامى في الذاكرة (لمنع التكرار)
                    const reaction = msg.reactions.cache.get('❤️');
                    if (reaction) {
                        const users = await reaction.users.fetch();
                        users.forEach(u => {
                            if (!u.bot) votesData.set(u.id, msg.id);
                        });
                    }
                }
            }

            if (maxNum > 0) {
                participantCount = maxNum;
                console.log(`✅ تم استعادة العداد: ${participantCount}`);
            } else {
                console.log(`ℹ️ لم يتم العثور على مشاركات سابقة، البدء من 0.`);
            }
        }
    } catch (error) {
        console.error("❌ خطأ في استرجاع البيانات:", error);
    }
});

// --- [النظام الجديد: منع التصويت لأكثر من شخص] ---
client.on('messageReactionAdd', async (reaction, user) => {
    if (user.bot) return;

    // التأكد من تحميل الرياكشن
    if (reaction.partial) {
        try { await reaction.fetch(); } catch (error) { return; }
    }

    // التحقق: الروم الصحيح + الإيموجي الصحيح
    if (reaction.message.channelId === CONFIG.CHANNELS.PARTICIPANTS && reaction.emoji.name === '❤️') {
        
        const previousVoteMsgId = votesData.get(user.id);
        const currentMsgId = reaction.message.id;

        // إذا كان لديه تصويت سابق في رسالة مختلفة -> نحذفه
        if (previousVoteMsgId && previousVoteMsgId !== currentMsgId) {
            try {
                const channel = await client.channels.fetch(CONFIG.CHANNELS.PARTICIPANTS);
                const oldMsg = await channel.messages.fetch(previousVoteMsgId);
                const oldReaction = oldMsg.reactions.cache.get('❤️');
                if (oldReaction) {
                    await oldReaction.users.remove(user.id);
                }
            } catch (error) {
                // تجاهل الخطأ إذا كانت الرسالة القديمة محذوفة أصلاً
            }
        }

        // تحديث سجل التصويت
        votesData.set(user.id, currentMsgId);
    }
});

// --- [حدث إزالة اللايك يدوياً: MessageReactionRemove] ---
client.on('messageReactionRemove', async (reaction, user) => {
    if (user.bot) return;
    if (reaction.message.channelId === CONFIG.CHANNELS.PARTICIPANTS && reaction.emoji.name === '❤️') {
        // إذا سحب اللايك بنفسه، نحذفه من الذاكرة ليتمكن من التصويت مجدداً
        if (votesData.get(user.id) === reaction.message.id) {
            votesData.delete(user.id);
        }
    }
});

// --- [حدث مغادرة العضو: GuildMemberRemove] ---
client.on('guildMemberRemove', async (member) => {
    try {
        const channel = client.channels.cache.get(CONFIG.CHANNELS.PARTICIPANTS);
        if (!channel) return;

        // تنظيف الذاكرة
        participantsData.delete(member.id);
        votesData.delete(member.id);

        const messages = await channel.messages.fetch({ limit: 100 });
        messages.forEach(async (msg) => {
            if (msg.author.id === client.user.id) {
                
                // 1. إذا كان المغادر هو صاحب المشاركة -> حذف المنشور
                if (msg.mentions.users.has(member.id)) {
                    await msg.delete().catch(() => {});
                    console.log(`🗑️ تم حذف مشاركة ${member.user.tag} للمغادرة.`);
                } 
                // 2. إذا لم يكن صاحب المشاركة، هل وضع لايك؟ -> حذف اللايك
                else {
                    const reaction = msg.reactions.cache.get('❤️');
                    if (reaction) {
                        await reaction.users.remove(member.id).catch(() => {});
                    }
                }
            }
        });
    } catch (error) {
        console.error("Error cleaning leaver:", error);
    }
});

// --- [حدث الرسائل: !setup] ---
client.on('messageCreate', async (message) => {
    if (message.content === '!setup') {
        if (!message.member.permissions.has('Administrator')) return;
        message.delete().catch(() => {});

        const embed = new EmbedBuilder()
            .setTitle('مسابقة على ملفات السلطان') 
            .setDescription(`${CONFIG.TEXTS.DESCRIPTION}\n• جائزة المسابقة: ${CONFIG.TEXTS.DEFAULT_PRIZE}.`)
            .setColor('#2f3136')
            .setImage(CONFIG.TEXTS.IMAGE_URL) 
            .setFooter({ text: 'Sultan Events', iconURL: client.user.displayAvatarURL() });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('register_btn').setLabel('تسجيل').setStyle(ButtonStyle.Success).setEmoji('✅'),
            new ButtonBuilder().setCustomId('withdraw_btn').setLabel('انسحاب').setStyle(ButtonStyle.Danger).setEmoji('🖍️'),
            new ButtonBuilder().setCustomId('settings_btn').setLabel('تعديل المسابقة').setStyle(ButtonStyle.Secondary).setEmoji('⚙️')
        );

        await message.channel.send({ embeds: [embed], components: [row] });
    }
});

// --- [التعامل مع الأزرار] ---
client.on('interactionCreate', async (interaction) => {
    
    if (interaction.isButton()) {
        const { customId } = interaction;

        if (customId === 'register_btn') {
            if (participantsData.has(interaction.user.id)) {
                return interaction.reply({ content: '⛔ أنت مسجل بالفعل!', ephemeral: true });
            }
            participantCount++; 
            const channel = client.channels.cache.get(CONFIG.CHANNELS.PARTICIPANTS);
            if (!channel) {
                participantCount--; 
                return interaction.reply({ content: '❌ خطأ: الروم غير موجود.', ephemeral: true });
            }
            try {
                const msg = await channel.send(`**المتسابق رقم #${participantCount}**\nالمشارك: ${interaction.user}`);
                await msg.react('❤️');
                participantsData.set(interaction.user.id, msg.id);
                await interaction.reply({ content: `✅ تم التسجيل! رقمك: **${participantCount}**`, ephemeral: true });
            } catch (error) {
                console.error(error);
                participantCount--;
                await interaction.reply({ content: '❌ حدث خطأ أثناء النشر.', ephemeral: true });
            }
        }

        if (customId === 'withdraw_btn') {
            if (!participantsData.has(interaction.user.id)) {
                return interaction.reply({ content: '⚠️ أنت لست مسجلاً.', ephemeral: true });
            }
            const msgId = participantsData.get(interaction.user.id);
            const channel = client.channels.cache.get(CONFIG.CHANNELS.PARTICIPANTS);
            if (channel) {
                try {
                    const msg = await channel.messages.fetch(msgId);
                    await msg.delete();
                    participantsData.delete(interaction.user.id);
                    await interaction.reply({ content: '🗑️ تم الانسحاب.', ephemeral: true });
                } catch (e) {
                    participantsData.delete(interaction.user.id);
                    await interaction.reply({ content: '⚠️ تم إزالة اسمك (الرسالة محذوفة مسبقاً).', ephemeral: true });
                }
            }
        }

        if (customId === 'settings_btn') {
            if (!interaction.member.roles.cache.has(CONFIG.ROLES.ADMIN)) {
                return interaction.reply({ content: '⛔ لا تملك صلاحية.', ephemeral: true });
            }
            const modal = new ModalBuilder().setCustomId('settings_modal').setTitle('إعدادات المسابقة');
            modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('new_title').setLabel("العنوان").setStyle(TextInputStyle.Short)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('new_prize').setLabel("الجائزة").setStyle(TextInputStyle.Short))
            );
            await interaction.showModal(modal);
        }
    }

    if (interaction.type === InteractionType.ModalSubmit) {
        if (interaction.customId === 'settings_modal') {
            const title = interaction.fields.getTextInputValue('new_title');
            const prize = interaction.fields.getTextInputValue('new_prize');
            const oldEmbed = interaction.message.embeds[0];
            const newEmbed = EmbedBuilder.from(oldEmbed).setTitle(title).setDescription(`${CONFIG.TEXTS.DESCRIPTION}\n• الجائزة: ${prize}.`);
            await interaction.message.edit({ embeds: [newEmbed] });
            await interaction.reply({ content: '✅ تم التحديث.', ephemeral: true });
        }
    }
});

client.login(CONFIG.TOKEN);
