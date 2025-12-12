/**
 * ============================================================
 * BOT: Event Organizer (Anti-Duplicate + Auto-Clean on Leave)
 * ============================================================
 */

// 1. استدعاء المكتبات الضرورية
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

// 2. إعدادات البوت والسيرفر (CONFIG)
// ==========================================
const CONFIG = {
    // التوكن يتم جلبه من متغيرات النظام
    TOKEN: process.env.TOKEN, 
    
    // إعدادات القنوات والرتب
    CHANNELS: {
        PARTICIPANTS: '1448832815658700820' // آيدي روم المشاركات
    },
    ROLES: {
        ADMIN: '1161578341313294427'      // آيدي الرتبة المسموح لها بالتعديل
    },
    
    // النصوص الثابتة
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

// 3. متغيرات الذاكرة (State)
// ==========================================
let participantCount = 0; // عداد المشاركين
const participantsData = new Map(); // تخزين مؤقت: UserID -> MessageID

// 4. إعداد السيرفر الوهمي (لإبقاء البوت يعمل 24 ساعة)
// ==========================================
const app = express();
app.get('/', (req, res) => res.send('Bot is running properly! 🤖'));
app.listen(3000, () => console.log('🟢 Fake server is ready on port 3000'));

// 5. تهيئة عميل الديسكورد (Client Setup)
// ==========================================
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,         // ضروري لمعرفة من غادر
        GatewayIntentBits.GuildMessageReactions // ضروري لحذف الرياكشن
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

// 6. الأحداث (Events)
// ==========================================

// --- [حدث التشغيل: Ready] ---
client.once('ready', async () => {
    console.log(`✅ Logged in as ${client.user.tag}`);
    
    try {
        const channel = await client.channels.fetch(CONFIG.CHANNELS.PARTICIPANTS).catch(() => null);
        if (channel) {
            console.log("🔄 جاري فحص الرسائل القديمة لاستعادة العداد...");
            const messages = await channel.messages.fetch({ limit: 50 });
            let maxNum = 0;

            messages.forEach(msg => {
                if (msg.author.id === client.user.id) {
                    const match = msg.content.match(/المتسابق رقم #(\d+)/);
                    if (match) {
                        const num = parseInt(match[1]);
                        if (num > maxNum) maxNum = num;
                    }
                }
            });

            if (maxNum > 0) {
                participantCount = maxNum;
                console.log(`✅ تم استعادة العداد. آخر رقم هو: ${participantCount}`);
            } else {
                console.log(`ℹ️ لم يتم العثور على مشاركات سابقة، البدء من 0.`);
            }
        }
    } catch (error) {
        console.error("❌ خطأ في استرجاع العداد:", error);
    }
});

// --- [حدث مغادرة العضو: GuildMemberRemove] (مهم جداً) ---
client.on('guildMemberRemove', async (member) => {
    try {
        const channel = client.channels.cache.get(CONFIG.CHANNELS.PARTICIPANTS);
        if (!channel) return;

        // نجلب آخر 100 رسالة لفحصها
        const messages = await channel.messages.fetch({ limit: 100 });

        messages.forEach(async (msg) => {
            // نتأكد أن الرسالة من البوت أولاً
            if (msg.author.id === client.user.id) {
                
                // 1. إذا كان المغادر هو صاحب المشاركة -> نحذف المنشور
                if (msg.mentions.users.has(member.id)) {
                    await msg.delete().catch(() => {});
                    participantsData.delete(member.id);
                    console.log(`🗑️ تم حذف مشاركة العضو ${member.user.tag} لأنه غادر السيرفر.`);
                } 
                // 2. إذا لم يكن المشارك، نفحص إذا كان قد وضع لايك -> نحذفه
                else {
                    const reaction = msg.reactions.cache.get('❤️');
                    if (reaction) {
                        // محاولة إزالة تفاعل العضو المغادر
                        await reaction.users.remove(member.id).catch(() => {});
                    }
                }
            }
        });
    } catch (error) {
        console.error("Error in cleaning up leaver data:", error);
    }
});

// --- [حدث الرسائل: MessageCreate] ---
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

// --- [حدث التفاعل: InteractionCreate] ---
client.on('interactionCreate', async (interaction) => {
    
    if (interaction.isButton()) {
        const { customId } = interaction;

        switch (customId) {
            case 'register_btn':
                await handleRegister(interaction);
                break;
            case 'withdraw_btn':
                await handleWithdraw(interaction);
                break;
            case 'settings_btn':
                await handleSettingsOpen(interaction);
                break;
        }
    }

    if (interaction.type === InteractionType.ModalSubmit) {
        if (interaction.customId === 'settings_modal') {
            await handleSettingsSubmit(interaction);
        }
    }
});

// 7. الدوال المساعدة (Helper Functions)
// ==========================================

// دالة التسجيل
async function handleRegister(interaction) {
    if (participantsData.has(interaction.user.id)) {
        return interaction.reply({ content: '⛔ عذراً، أنت مسجل في المسابقة بالفعل!', ephemeral: true });
    }

    participantCount++; 
    const channel = client.channels.cache.get(CONFIG.CHANNELS.PARTICIPANTS);

    if (!channel) {
        participantCount--; 
        return interaction.reply({ content: '❌ حدث خطأ: لم يتم العثور على روم المشاركات.', ephemeral: true });
    }

    try {
        const msg = await channel.send(`**المتسابق رقم #${participantCount}**\nالمشارك: ${interaction.user}`);
        await msg.react('❤️');
        
        participantsData.set(interaction.user.id, msg.id);
        await interaction.reply({ content: `✅ تم تسجيل مشاركتك بنجاح! رقمك هو **${participantCount}**`, ephemeral: true });
    } catch (error) {
        console.error(error);
        participantCount--;
        await interaction.reply({ content: '❌ حدث خطأ أثناء النشر، تأكد من صلاحيات البوت.', ephemeral: true });
    }
}

// دالة الانسحاب
async function handleWithdraw(interaction) {
    if (!participantsData.has(interaction.user.id)) {
        return interaction.reply({ content: '⚠️ أنت لست مسجلاً في المسابقة حالياً.', ephemeral: true });
    }

    const msgId = participantsData.get(interaction.user.id);
    const channel = client.channels.cache.get(CONFIG.CHANNELS.PARTICIPANTS);

    if (channel) {
        try {
            const msg = await channel.messages.fetch(msgId);
            await msg.delete();
            participantsData.delete(interaction.user.id);
            await interaction.reply({ content: '🗑️ تم سحب مشاركتك وحذف منشورك بنجاح.', ephemeral: true });
        } catch (error) {
            participantsData.delete(interaction.user.id);
            await interaction.reply({ content: '⚠️ تم إزالة اسمك من القائمة، لكن لم يتم العثور على الرسالة لحذفها.', ephemeral: true });
        }
    }
}

// دالة فتح نافذة الإعدادات
async function handleSettingsOpen(interaction) {
    if (!interaction.member.roles.cache.has(CONFIG.ROLES.ADMIN)) {
        return interaction.reply({ content: '⛔ ليس لديك الصلاحية لتعديل المسابقة.', ephemeral: true });
    }

    const modal = new ModalBuilder()
        .setCustomId('settings_modal')
        .setTitle('إعدادات المسابقة');

    const titleInput = new TextInputBuilder()
        .setCustomId('new_title_input')
        .setLabel("عنوان المسابقة الجديد")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("مثال: مسابقة نايترو جيمنج")
        .setRequired(true);

    const prizeInput = new TextInputBuilder()
        .setCustomId('new_prize_input')
        .setLabel("اسم الجائزة الجديد")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("مثال: 10 دولار")
        .setRequired(true);

    modal.addComponents(
        new ActionRowBuilder().addComponents(titleInput),
        new ActionRowBuilder().addComponents(prizeInput)
    );

    await interaction.showModal(modal);
}

// دالة حفظ الإعدادات
async function handleSettingsSubmit(interaction) {
    const newTitle = interaction.fields.getTextInputValue('new_title_input');
    const newPrize = interaction.fields.getTextInputValue('new_prize_input');

    const oldEmbed = interaction.message.embeds[0];
    const newDescription = `${CONFIG.TEXTS.DESCRIPTION}\n• جائزة المسابقة: ${newPrize}.`;

    const newEmbed = EmbedBuilder.from(oldEmbed)
        .setTitle(newTitle)
        .setDescription(newDescription);

    await interaction.message.edit({ embeds: [newEmbed] });
    await interaction.reply({ content: `✅ تم تحديث المسابقة!\nالعنوان: ${newTitle}\nالجائزة: ${newPrize}`, ephemeral: true });
}

// 8. تشغيل البوت
// ==========================================
client.login(CONFIG.TOKEN);
