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
// 1. كود السيرفر الوهمي (لإبقاء البوت 24 ساعة)
// ==========================================
const app = express();
const port = 3000;

app.get('/', (req, res) => {
  res.send('Bot is running properly! 🤖');
});

app.listen(port, () => {
  console.log(`Fake server listening at http://localhost:${port}`);
});

// ==========================================
// 2. إعدادات البوت
// ==========================================

// ملاحظة: التوكن نأخذه من متغيرات النظام للحماية
// لا تضع التوكن هنا مباشرة إذا كنت سترفع الكود
const TOKEN = process.env.TOKEN || 'ضع_التوكن_الجديد_هنا_للتجربة_فقط'; 

const PARTICIPANTS_CHANNEL_ID = '1448832815658700820'; // آيدي روم المشاركات
const ALLOWED_ROLE_ID = '1161578341313294427'; // آيدي الرتبة المسموح لها بالتعديل

// النص الثابت لطريقة المشاركة والشروط
const FIXED_DESCRIPTION_PART = 
    "**طريقة المشاركة:**\n" +
    "1- اضغط على زر \"تسجيل في المسابقة\".\n" +
    "2- سيتم تسجيل اسمك ونشر مشاركتك في روم مشتركين المسابقة.\n" +
    "3- اطلب من أصدقائك التفاعل مع مشاركتك.\n" +
    "4- الفائز هو صاحب أكبر عدد من التفاعلات.\n\n" +
    "**شروط المسابقة:**\n" +
    "• يمنع استخدام الحسابات الوهمية أو تكرار الحسابات.\n" +
    "• يحق للإدارة استبعاد أي مشاركة تخالف الشروط.";

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

let participantCount = 0;
// تنبيه: هذه الذاكرة تمسح عند إعادة تشغيل البوت
// للاستضافة المجانية يفضل مستقبلاً استخدام قاعدة بيانات
const participantsData = new Map(); 

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}`);
    console.log(`Ready to manage events! 🚀`);
});

// التعامل مع أمر !setup
client.on('messageCreate', async (message) => {
    if (message.content === '!setup') {
        // التأكد من أن الشخص أدمن
        if (!message.member.permissions.has('Administrator')) return;

        // حذف رسالة الأمر
        message.delete().catch(() => {});

        const defaultPrize = "ملفات السلطان";
        
        const embed = new EmbedBuilder()
            .setTitle('مسابقة على ملفات السلطان') 
            .setDescription(
                `${FIXED_DESCRIPTION_PART}\n` +
                `• جائزة المسابقة: ${defaultPrize}.`
            )
            .setColor('#2f3136')
            .setImage('https://cdn.discordapp.com/attachments/1439305348174450859/1448836889242112131/28df69b032c2f21898dd80751b61791f.png') 
            .setFooter({ text: 'Sultan Events', iconURL: client.user.displayAvatarURL() });

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('register_btn')
                    .setLabel('تسجيل')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('✅'),
                
                new ButtonBuilder()
                    .setCustomId('withdraw_btn')
                    .setLabel('انسحاب')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('🖍️'),

                new ButtonBuilder()
                    .setCustomId('settings_btn')
                    .setLabel('تعديل المسابقة')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('⚙️')
            );

        await message.channel.send({ embeds: [embed], components: [row] });
    }
});

// التعامل مع التفاعلات
client.on('interactionCreate', async (interaction) => {
    
    // التعامل مع الأزرار
    if (interaction.isButton()) {
        const { customId, user, member } = interaction;

        // --- زر الإعدادات (تعديل العنوان + الجائزة) ---
        if (customId === 'settings_btn') {
            
            if (!member.roles.cache.has(ALLOWED_ROLE_ID)) {
                return interaction.reply({ content: '⛔ عذراً، ليس لديك الرتبة المخصصة لتعديل المسابقة.', ephemeral: true });
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

            const firstActionRow = new ActionRowBuilder().addComponents(titleInput);
            const secondActionRow = new ActionRowBuilder().addComponents(prizeInput);
            
            modal.addComponents(firstActionRow, secondActionRow);

            await interaction.showModal(modal);
            return; 
        }

        // --- زر التسجيل ---
        if (customId === 'register_btn') {
            if (participantsData.has(user.id)) {
                return interaction.reply({ content: 'عذراً، أنت مسجل في المسابقة بالفعل!', ephemeral: true });
            }

            participantCount++;
            const channel = client.channels.cache.get(PARTICIPANTS_CHANNEL_ID);

            if (!channel) {
                return interaction.reply({ content: 'حدث خطأ: لم يتم العثور على روم المشاركات. تأكد من الآيدي', ephemeral: true });
            }

            try {
                // إرسال المشاركة للروم
                const msg = await channel.send(`**المتسابق رقم #${participantCount}**\nالمشارك: ${user}`);
                await msg.react('❤️');
                
                // حفظ البيانات
                participantsData.set(user.id, msg.id);
                
                await interaction.reply({ content: `تم تسجيل مشاركتك بنجاح! رقمك هو **${participantCount}**`, ephemeral: true });
            } catch (error) {
                console.error(error);
                await interaction.reply({ content: 'حدث خطأ أثناء النشر، تأكد من صلاحيات البوت في روم المشاركات.', ephemeral: true });
            }
        }

        // --- زر الانسحاب ---
        if (customId === 'withdraw_btn') {
            if (!participantsData.has(user.id)) {
                return interaction.reply({ content: 'أنت لست مسجلاً في المسابقة!', ephemeral: true });
            }

            const msgId = participantsData.get(user.id);
            const channel = client.channels.cache.get(PARTICIPANTS_CHANNEL_ID);

            if (channel) {
                try {
                    const msg = await channel.messages.fetch(msgId);
                    await msg.delete();
                    participantsData.delete(user.id);
                    await interaction.reply({ content: 'تم سحب مشاركتك وحذف منشورك بنجاح.', ephemeral: true });
                } catch (error) {
                    participantsData.delete(user.id);
                    await interaction.reply({ content: 'تم إزالة اسمك من القائمة (لم يتم العثور على الرسالة لحذفها).', ephemeral: true });
                }
            }
        }
    }

    // التعامل مع الـ Modal (حفظ التعديلات)
    if (interaction.type === InteractionType.ModalSubmit) {
        if (interaction.customId === 'settings_modal') {
            const newTitle = interaction.fields.getTextInputValue('new_title_input');
            const newPrize = interaction.fields.getTextInputValue('new_prize_input');

            // جلب الرسالة الأصلية التي احتوت على الزر لتعديلها
            const oldEmbed = interaction.message.embeds[0];
            
            // تحديث الوصف والجائزة
            const newDescription = `${FIXED_DESCRIPTION_PART}\n• جائزة المسابقة: ${newPrize}.`;

            const newEmbed = EmbedBuilder.from(oldEmbed)
                .setTitle(newTitle)
                .setDescription(newDescription); // تم إصلاح الخطأ هنا (استخدام متغير جديد للوصف)

            await interaction.message.edit({ embeds: [newEmbed] });
            await interaction.reply({ content: `تم تحديث المسابقة بنجاح!\nالعنوان: ${newTitle}\nالجائزة: ${newPrize}`, ephemeral: true });
        }
    }
});

client.login(TOKEN);