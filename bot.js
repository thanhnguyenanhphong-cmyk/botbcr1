const { Telegraf, Scenes, session, Markup } = require('telegraf');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const lastSessions = {};
const userSubscriptions = {};

// ==================== [ 🛑 CẤU HÌNH HỆ THỐNG ] ====================
const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_ID = 7338417401; 
// ==================================================================

const bot = new Telegraf(BOT_TOKEN);
const DB_FILE = path.join(__dirname, 'db.json');

// --- 📦 DATABASE FILE JSON ---
function loadDB() {
    if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify({}));
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}
function saveDB(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}
function getUser(userId, name) {
    const db = loadDB();
    if (!db[userId]) {
        db[userId] = { name: name || 'Khách', balance: 0, is_vip: false, vip_until: 0 };
        saveDB(db);
    }
    if (db[userId].is_vip && db[userId].vip_until !== 'permanent' && db[userId].vip_until < Date.now()) {
        db[userId].is_vip = false;
        db[userId].vip_until = 0;
        saveDB(db);
    }
    return db[userId];
}
function updateUserBalance(userId, amount) {
    const db = loadDB();
    if (db[userId]) {
        db[userId].balance += amount;
        saveDB(db);
        return db[userId].balance;
    }
    return 0;
}

// HÀM CỘNG DỒN THỜI GIAN VIP
function addVipTime(userId, days) {
    const db = loadDB();
    if (!db[userId]) return;

    db[userId].is_vip = true;
    
    if (days === 'permanent') {
        db[userId].vip_until = 'permanent';
    } else {
        if (db[userId].vip_until === 'permanent') return;

        const msToAdd = days * 24 * 60 * 60 * 1000;
        if (db[userId].vip_until > Date.now()) {
            db[userId].vip_until += msToAdd;
        } else {
            db[userId].vip_until = Date.now() + msToAdd;
        }
    }
    saveDB(db);
}

// HÀM ĐỔI THỜI GIAN CÒN LẠI SANG TIẾNG VIỆT (FULL ICON)
function getVipStatusText(u) {
    if (!u.is_vip) return '❌ Chưa Đăng Ký VIP';
    if (u.vip_until === 'permanent') return '🏆 Vĩnh Viễn (Trọn Đời)';
    
    const timeLeft = u.vip_until - Date.now();
    if (timeLeft <= 0) return '❌ Đã Hết Hạn VIP';

    const totalMinutes = Math.floor(timeLeft / (1000 * 60));
    const totalHours = Math.floor(totalMinutes / 60);
    const days = Math.floor(totalHours / 24);
    
    const hours = totalHours % 24;
    const minutes = totalMinutes % 60;

    let text = '👑 VIP PRO (⏳ Còn ';
    if (days > 0) text += `${days} Ngày `;
    if (hours > 0) text += `${hours} Giờ `;
    text += `${minutes} Phút) ⚡`;
    return text;
}
function checkVipStatus(userId) {
    const u = getUser(userId);

    if (!u.is_vip) {
        return {
            isVip: false,
            text: '❌ Chưa Đăng Ký VIP'
        };
    }

    if (u.vip_until === 'permanent') {
        return {
            isVip: true,
            text: '🏆 Vĩnh Viễn (Trọn Đời)'
        };
    }

    if (u.vip_until > Date.now()) {
        return {
            isVip: true,
            text: getVipStatusText(u)
        };
    }

    return {
        isVip: false,
        text: '❌ Đã Hết Hạn VIP'
    };
}
// --- 🔱 GIAO DIỆN TEXT NGẮN GỌN ---
const formatHeader = (title) => {
    return `✨ ${title} ✨\n━━━━━━━━━━━━━━━━━━\n`;
};
const formatFooter = () => {
    return `\n━━━━━━━━━━━━━━━━━━\n⚡ Hỗ trợ tự động 24/7`;
};

// --- ⚙️ ĐỊNH NGHĨA TEXT CÁC NÚT BẤM ---
const BTN_GAME = '🎮 CHỌN GAME';
const BTN_NAP = '💳 NẠP TIỀN';
const BTN_VIP = '👑 MUA VIP';
const BTN_USER = '👤 TÀI KHOẢN';

const mainReplyMarkup = () => Markup.keyboard([
    [BTN_GAME, BTN_NAP],
    [BTN_VIP, BTN_USER]
]).resize().reply_markup;

const tableMarkup = () => Markup.inlineKeyboard([
[
Markup.button.callback('🔹 Bàn 1 🔹', 'table_1'),
Markup.button.callback('🔹 Bàn 2 🔹', 'table_2')
],
[
Markup.button.callback('🔹 Bàn 3 🔹', 'table_3'),
Markup.button.callback('🔹 Bàn 4 🔹', 'table_4')
],
[
Markup.button.callback('🔹 Bàn 5 🔹', 'table_5'),
Markup.button.callback('🔸 Bàn C01 🔸', 'table_c01')
],
[
Markup.button.callback('🔸 Bàn C02 🔸', 'table_c02'),
Markup.button.callback('🔸 Bàn C03 🔸', 'table_c03')
],
[
Markup.button.callback('🔸 Bàn C04 🔸', 'table_c04'),
Markup.button.callback('🔸 Bàn C05 🔸', 'table_c05')
]
]).reply_markup;
const vipMarkup = () => Markup.inlineKeyboard([
    [Markup.button.callback('🎫 1 Ngày • 30k ⚡', 'buy_1d'), Markup.button.callback('🎫 3 Ngày • 55k 🔥', 'buy_3d')],
    [Markup.button.callback('💎 7 Ngày • 90k ✨', 'buy_7d'), Markup.button.callback('👑 Vĩnh Viễn • 250k 🏆', 'buy_vv')]
]).reply_markup;


// ==================== [ 💳 BƯỚC NẠP TIỀN ] ====================
const napTienWizard = new Scenes.WizardScene(
    'nap_tien_scene',
    
    async (ctx) => {
        let text = formatHeader('💰 NHẬP SỐ TIỀN 💰') +
                   `Vui lòng nhập số tiền muốn nạp vào ô chat.\n` +
                   `• Ví dụ: 30000, 50000, 100000...` +
                   formatFooter();
        await ctx.replyWithMarkdown(text, Markup.inlineKeyboard([[Markup.button.callback('❌ Hủy Nạp ❌', 'cancel_nap')]]));
        return ctx.wizard.next();
    },

    async (ctx) => {
        if (!ctx.message || !ctx.message.text) {
            await ctx.reply('⚠️ Vui lòng nhập số tiền bằng chữ số.');
            return;
        }
        const sotien = parseInt(ctx.message.text.trim().replace(/\D/g, ''));
        if (isNaN(sotien) || sotien < 10000) {
            await ctx.reply('❌ Nạp tối thiểu 10.000đ. Vui lòng nhập lại số tiền:');
            return;
        }

ctx.wizard.state.sotien = sotien;

function generateNapCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const nums = '0123456789';

    let code = 'NAP';

    for (let i = 0; i < 4; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
    }

    for (let i = 0; i < 3; i++) {
        code += nums[Math.floor(Math.random() * nums.length)];
    }

    for (let i = 0; i < 3; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
    }

    return code;
}

const userId = ctx.from.id;
const noidung = generateNapCode();

ctx.wizard.state.noidung = noidung;
const qrUrl = `https://img.vietqr.io/image/MOMO-0394432469-compact2.png?amount=${sotien}&addInfo=${encodeURIComponent(noidung)}&accountName=NGUYEN%20THI%20THANH`;
        // Đã thêm Icon đẹp mắt vào từng dòng thông tin chuyển khoản
        let textInvoice = formatHeader('✨ CHUYỂN KHOẢN ✨') +
                          `Chuyển khoản MoMo hoặc quét mã QR:\n\n` +
                          `• 🏦 Ngân hàng: Ví MOMO\n` +
                          `• 💳 Số tài khoản: \`0394432469\`\n` +
                          `• 👤 Chủ tài khoản: NGUYEN THI THANH\n` +
                          `• 💵 Số tiền: **${sotien.toLocaleString('vi-VN')}đ**\n` +
                          `• 📝 Nội dung: \`${noidung}\` *(Ấn để copy)*` +
                          formatFooter();

        const confirmMarkup = Markup.inlineKeyboard([
            [Markup.button.callback('🟢 ĐÃ CHUYỂN KHOẢN', 'da_chuyen_khoan')],
            [Markup.button.callback('❌ Hủy Nạp', 'cancel_nap')]
        ]).reply_markup;

        await ctx.replyWithPhoto({ url: qrUrl }, { caption: textInvoice, parse_mode: 'Markdown', reply_markup: confirmMarkup }).catch(async () => {
            await ctx.replyWithMarkdown(textInvoice, { reply_markup: confirmMarkup });
        });
        return ctx.wizard.next();
    },

    async (ctx) => {
        if (ctx.callbackQuery && ctx.callbackQuery.data === 'da_chuyen_khoan') {
            await ctx.answerCbQuery();
            await ctx.replyWithMarkdown(`📸 **Vui lòng gửi ảnh bill**`);
            return; 
        }
        if (ctx.callbackQuery && ctx.callbackQuery.data === 'cancel_nap') return;

        if (!ctx.message || !ctx.message.photo) {
            await ctx.reply('⚠️ Vui lòng nhấn nút [🟢 ĐÃ CHUYỂN KHOẢN] hoặc gửi ảnh bill để tiếp tục.');
            return;
        }

        const name = ctx.from.first_name || 'Khách';
        const userId = ctx.from.id;
        const sotien = ctx.wizard.state.sotien;
const fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
const noidung = ctx.wizard.state.noidung;
        await ctx.replyWithMarkdown(`✅ **Đã gửi hóa đơn!** Vui lòng đợi 1-3 phút để Admin duyệt tiền.`, { reply_markup: mainReplyMarkup() });

        try {
            const adminButtons = Markup.inlineKeyboard([
                [Markup.button.callback('✅ DUYỆT', `admin_accept_${userId}_${sotien}`), Markup.button.callback('❌ TỪ CHỐI', `admin_decline_${userId}`)]
            ]).reply_markup;

            await ctx.telegram.sendPhoto(ADMIN_ID, fileId, {
                caption: `🚨 **BILL NẠP TIỀN MỚI** 🚨\n• Khách: ${name}\n• ID: \`${userId}\`\n• Số tiền: **${sotien.toLocaleString('vi-VN')}đ**\n• Nội dung CK: \`${noidung}\``,
                parse_mode: 'Markdown',
                reply_markup: adminButtons
            });
        } catch (error) { console.error(error); }
        return ctx.scene.leave();
    }
);

const stage = new Scenes.Stage([napTienWizard]);
stage.action('cancel_nap', async (ctx) => {
    await ctx.answerCbQuery('❌ Hủy nạp tiền.');
    await ctx.scene.leave();
    await ctx.replyWithMarkdown(`🔥 **Đã hủy giao dịch.** Vui lòng chọn chức năng bên dưới:`, { reply_markup: mainReplyMarkup() });
});

bot.use(session());
bot.use(stage.middleware());


// --- 🚀 LỆNH /START ---
bot.start((ctx) => {
    const name = ctx.from.first_name || 'Khách';
    const u = getUser(ctx.from.id, name);
    // Đã thêm Icon đẹp mắt vào giao diện Menu chính
    let text = formatHeader('👋 MENU CHÍNH 👋') +
               `Chào mừng **${name}**!\n` +
               `• 👤 Khách hàng: **${name}**\n` +
               `• 💰 Số dư ví: \`${u.balance.toLocaleString('vi-VN')}đ\`\n` +
               `• 👑 Kích Hoạt: ${getVipStatusText(u)}\n\n` +
               `Chọn chức năng dưới bàn phím để bắt đầu:` +
               formatFooter();
    ctx.replyWithMarkdown(text, { reply_markup: mainReplyMarkup() });
});


// --- ⚡ XỬ LÝ SỰ KIỆN BẤM BÀN PHÍM DƯỚI CHAT ---
bot.hears(BTN_GAME, async (ctx) => {
    let text = formatHeader('🎮 DANH SÁCH GAME 🎮') +
           `Vui lòng chọn bàn bạn muốn cài đặt Tool:\n` +
           `• 👑 Yêu cầu cấp bậc: **VIP PRO**` +
           formatFooter();
    await ctx.replyWithMarkdown(text, { reply_markup: tableMarkup() });
});

bot.hears(BTN_NAP, async (ctx) => {
    await ctx.scene.enter('nap_tien_scene');
});

bot.hears(BTN_VIP, async (ctx) => {
    let text = formatHeader('👑 BẢNG GIÁ VIP 👑') +
           `Mua gói VIP để mở khóa toàn bộ game:\n\n` +
           `• 🎫 Gói 1 Ngày ── Giá: \`30.000đ\` ⚡\n` +
           `• 🎫 Gói 3 Ngày ── Giá: \`55.000đ\` 🔥\n` +
           `• 💎 Gói 7 Ngày ── Giá: \`90.000đ\` ✨\n` +
           `• 👑 Vĩnh Viễn  ── Giá: \`250.000đ\` 🏆\n\n` +
           `👉 Bấm nút tương ứng bên dưới để mua:`;
    await ctx.replyWithMarkdown(text, { reply_markup: vipMarkup() });
});

bot.hears(BTN_USER, async (ctx) => {
    const u = getUser(ctx.from.id, ctx.from.first_name);
    // Đã thêm Icon đầy đủ và bo góc đẹp mắt giống hình bạn gửi
    const vipInfo = checkVipStatus(ctx.from.id);

let text = formatHeader('✨ THÔNG TIN TÀI KHOẢN ✨') +
       `• 🆔 ID: \`${ctx.from.id}\`\n` +
       `• 💰 Số dư: \`${u.balance.toLocaleString('vi-VN')}đ\`\n` +
       `• 👑 Gói VIP: ${vipInfo.isVip ? '👑 VIP PRO' : 'Chưa đăng ký'}\n` +
       `• ⏳ Hạn dùng: ${vipInfo.text}` +
       formatFooter();
    await ctx.replyWithMarkdown(text, { reply_markup: mainReplyMarkup() });
});


// --- ⚡ XỬ LÝ NÚT INLINE ---
bot.on('callback_query', async (ctx) => {
    const data = ctx.callbackQuery.data;
    const userId = ctx.from.id;
    const u = getUser(userId, ctx.from.first_name);
    let text = '';

    // ADMIN DUYỆT TIỀN
    if (data.startsWith('admin_accept_')) {
        if (ctx.from.id !== ADMIN_ID) return ctx.answerCbQuery('❌ Bạn không phải Admin!');
        const parts = data.split('_');
        const targetUserId = parts[2];
        const amount = parseInt(parts[3]);

        updateUserBalance(targetUserId, amount);
        await ctx.editMessageCaption(`✅ **DUYỆT CỘNG TIỀN THÀNH CÔNG**\n• Đã cộng **+${amount.toLocaleString('vi-VN')}đ** cho ID: \`${targetUserId}\`.`, { reply_markup: null }).catch(() => {});
        
        try {
            await ctx.telegram.sendMessage(targetUserId, `🎉 **NẠP TIỀN THÀNH CÔNG** 🎉\n• Tài khoản của bạn được Admin cộng ví: **+${amount.toLocaleString('vi-VN')}đ**\n• Hệ thống đã tự động cập nhật số dư mới!`);
        } catch (e) {}

        try {
const randomCode = 'VIP-AP' + Math.floor(1000 + Math.random() * 9000) + 'B';

const userInfo = await ctx.telegram.getChat(targetUserId);
const username = userInfo.username
    ? '@' + userInfo.username
    : targetUserId;

let billNotify = `🔔 THÔNG BÁO GIAO DỊCH 🔔\n` +
                 `━━━━━━━━━━━━━━━━━━\n` +
                 `👤 Tài khoản: ${username}\n` +
                 `💰 Số tiền nạp: ${amount.toLocaleString('vi-VN')} VND\n` +
                 `⚙️ Trạng thái: 🟢 ĐÃ DUYỆT\n` +
                 `━━━━━━━━━━━━━━━━━━\n` +
                 `👑 @Toolbcrpro_bot`;
            await ctx.telegram.sendMessage(ADMIN_ID, billNotify);
        } catch (e) {}
        return ctx.answerCbQuery('✅ Đã duyệt tiền!', { show_alert: true });
    }

    if (data.startsWith('admin_decline_')) {
        if (ctx.from.id !== ADMIN_ID) return ctx.answerCbQuery('❌ Bạn không phải Admin!');
        const parts = data.split('_');
        const targetUserId = parts[2];
        await ctx.editMessageCaption(`❌ **ĐÃ TỪ CHỐI BILL** cho ID: \`${targetUserId}\`.`, { reply_markup: null }).catch(() => {});
        try {
            await ctx.telegram.sendMessage(targetUserId, `❌ **HÓA ĐƠN BỊ TỪ CHỐI** ❌\n• Admin không tìm thấy giao dịch. Vui lòng kiểm tra lại banking MoMo!`);
        } catch (e) {}
        return ctx.answerCbQuery('❌ Đã từ chối!', { show_alert: true });
    }

if (data.startsWith('table_')) {
const tableName = data.replace('table_', '').toUpperCase();

userSubscriptions[userId] = tableName;
const user = getUser(userId);

const isVip =
    user.is_vip &&
    (
        user.vip_until === 'permanent' ||
        user.vip_until > Date.now()
    );

if (isVip) {
    try {
        const axios = require('axios');

        const res = await axios.get(
            'https://api-dudoansexy-2.onrender.com/dudoan/sexy/all'
        );

const dataArray = Array.isArray(res.data)
    ? res.data
    : (res.data.data || []);

const tableData = dataArray.find(
    x => String(x.ban).toUpperCase() === tableName
);

        if (!tableData) {
            return ctx.answerCbQuery('❌ Không tìm thấy dữ liệu bàn!', {
                show_alert: true
            });
        }

        const duDoan =
            tableData.du_doan === 'Banker'
                ? '🏦 NHÀ CÁI (BANKER)'
                : '👤 NHÀ CON (PLAYER)';

        text =
            `👑 DỰ ĐOÁN BACCARAT VIP 👑\n\n` +
            `🎰 Bàn: ${tableData.ban}\n` +
            `🎯 DỰ ĐOÁN: ${duDoan}\n` +
            `📊 Độ tin cậy: ${tableData.do_tin_cay}\n` +
            `🔥 Phiên hiện tại: ${tableData.phien_hien_tai}\n` +
            
            `📜 ${tableData.ket_qua.slice(-30)}`;

const backToTable = Markup.inlineKeyboard([
    [Markup.button.callback('🛑 DỪNG', 'stop_predict')],
    [Markup.button.callback('↩️ Trở Lại Danh Sách', 'refresh_tables')]
]).reply_markup;
        await ctx.editMessageText(text, {
            reply_markup: backToTable
        }).catch(() => {});

    } catch (err) {
        console.error(err);
        await ctx.answerCbQuery('❌ Lỗi kết nối API!', {
            show_alert: true
        });
    }
} else {
    await ctx.answerCbQuery(
        `🔒 Bạn cần mua VIP để mở khóa Bàn ${tableName}!`,
        { show_alert: true }
    );
}

}
else if (data === 'stop_predict') {

    delete userSubscriptions[userId];

    await ctx.answerCbQuery('🛑 Đã dừng dự đoán');

    const text =
        formatHeader('🎮 DANH SÁCH GAME 🎮') +
        `Vui lòng chọn bàn bạn muốn cài đặt Tool:\n` +
        `• 👑 Yêu cầu cấp bậc: VIP PRO` +
        formatFooter();

    await ctx.editMessageText(text, {
        parse_mode: 'Markdown',
        reply_markup: tableMarkup()
    }).catch(() => {});

    return;
}
else if (data === 'refresh_tables') {
text =
formatHeader('🎮 DANH SÁCH BÀN GAME 🎮') +
`Vui lòng chọn bàn muốn xem dự đoán.\n` +
`• Yêu cầu cấp bậc: 👑 VIP PRO` +
formatFooter();

await ctx.editMessageText(text, {
    parse_mode: 'Markdown',
    reply_markup: tableMarkup()
}).catch(() => {});
}

    // XỬ LÝ MUA GÓI VIP CỘNG DỒN THỜI GIAN
    else if (data.startsWith('buy_')) {
        const pack = data.replace('buy_', '');
        const prices = { '1d': 30000, '3d': 55000, '7d': 90000, 'vv': 250000 };
        const daysMapping = { '1d': 1, '3d': 3, '7d': 7, 'vv': 'permanent' };
        const expTexts = { '1d': 'VIP 1 Ngày ⚡', '3d': 'VIP 3 Ngày 🔥', '7d': 'VIP 7 Ngày ✨', 'vv': 'Vĩnh Viễn 🏆 ♾️' };
        const price = prices[pack];

        if (u.balance >= price) {
            updateUserBalance(userId, -price); 
            addVipTime(userId, daysMapping[pack]);            
            const updatedUser = getUser(userId, ctx.from.first_name);
            const newVipInfo = checkVipStatus(userId);

            await ctx.answerCbQuery(`🎉 Mua thành công!`, { show_alert: true });
            
            let textUser = formatHeader('✨ THÔNG TIN TÀI KHOẢN ✨') +
                           `• 🆔 ID: \`${userId}\`\n` +
                           `• 💰 Số dư: \`${updatedUser.balance.toLocaleString('vi-VN')}đ\`\n` +
                           `• 👑 Gói VIP: 👑 VIP PRO\n` +
                           `• ⏳ Hạn dùng: ${newVipInfo.text}` + 
                           formatFooter();
            await ctx.replyWithMarkdown(textUser, { reply_markup: mainReplyMarkup() });
        } else {
            await ctx.answerCbQuery(`❌ Thất bại! Bạn cần tối thiểu ${price.toLocaleString('vi-VN')}đ để mua gói này. Vui lòng nạp tiền!`, { show_alert: true });
        }
    }
});

bot.on('photo', async (ctx) => {
    await ctx.reply('⚠️ Vui lòng nhấn nút [💳 NẠP TIỀN] dưới bàn phím trước khi gửi ảnh bill.');
});
async function checkNewSessions() {
    try {
        const res = await axios.get(
            'https://api-dudoansexy-2.onrender.com/dudoan/sexy/all'
        );

        const tables = Array.isArray(res.data)
            ? res.data
            : (res.data.data || []);

        for (const table of tables) {

            const tableKey = String(table.ban);

            if (!lastSessions[tableKey]) {
                lastSessions[tableKey] = table.phien_hien_tai;
                continue;
            }

            if (lastSessions[tableKey] !== table.phien_hien_tai) {

                lastSessions[tableKey] = table.phien_hien_tai;

                const duDoan =
                    table.du_doan === 'Banker'
                        ? '🏦 NHÀ CÁI (BANKER)'
                        : '👤 NHÀ CON (PLAYER)';

                const text =
                    `👑 DỰ ĐOÁN BACCARAT VIP 👑\n\n` +
                    `🎰 Bàn: ${table.ban}\n` +
                    `🎯 DỰ ĐOÁN: ${duDoan}\n` +
                    `📊 Độ tin cậy: ${table.do_tin_cay}\n` +
                    `🔥 Phiên hiện tại: ${table.phien_hien_tai}\n` +
                    `📜 ${table.ket_qua.slice(-30)}`;

                // gửi cho VIP
                const db = loadDB();

// gửi cho người đang theo dõi đúng bàn

for (const userId in userSubscriptions) {

    if (
        userSubscriptions[userId] ===
        String(table.ban).toUpperCase()
    ) {

        try {
await bot.telegram.sendMessage(
    userId,
    text,
    {
        reply_markup: Markup.inlineKeyboard([
            [
                Markup.button.callback('🛑 DỪNG', 'stop_predict')
            ],
            [
                Markup.button.callback('🎮 CHỌN BÀN', 'refresh_tables')
            ]
        ]).reply_markup
    }
);
        } catch (e) {}
    }
}
            }
        }
    } catch (err) {
        console.log('Lỗi check phiên:', err.message);
    }
}
console.log('💎 BOT TELEGRAM ĐÃ ĐỒNG BỘ ĐẦY ĐỦ ICON VÀ GIAO DIỆN TÀI KHOẢN CHUẨN XỊN!');

setInterval(checkNewSessions, 2000);

bot.launch();

// ===== EXPRESS CHO RENDER =====
const express = require('express');
const app = express();

app.get('/', (req, res) => {
    res.send('Bot Telegram Online');
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server chạy cổng ${PORT}`);
});
