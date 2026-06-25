const { Telegraf, Scenes, session, Markup } = require('telegraf');
const axios = require('axios');
const express = require('express');

// --- ⚙️ CẤU HÌNH BIẾN MÔI TRƯỜNG ---
// Thay thế dòng cũ bằng dòng này, xóa hẳn chuỗi token lộ ra ngoài
const BOT_TOKEN = process.env.BOT_TOKEN; 

if (!BOT_TOKEN) {
    console.error('❌ LỖI NGHIÊM TRỌNG: Chưa cấu hình biến môi trường BOT_TOKEN trên Render!');
    process.exit(1); // Dừng bot nếu thiếu token để tránh lỗi crash hệ thống
}
const ADMIN_ID = parseInt(process.env.ADMIN_ID || '7338417401'); // Thay bằng ID Telegram của bạn

const bot = new Telegraf(BOT_TOKEN);

// --- 🗄️ BỘ NHỚ LƯU TRỮ HỆ THỐNG ---
let userSubscriptions = {};  // Trạng thái theo dõi bàn: { userId: "BÀN 1" }
let lastSessions = {};       // Phiên hiện tại của các bàn: { "BÀN 1": "123" }
let blockedUsers = new Set();  // Danh sách ID bị chặn

// Các hằng số Text Menu bàn phím
const BTN_GAME = '🎮 CHỌN GAME';
const BTN_NAP = '💳 NẠP TIỀN';
const BTN_VIP = '👑 MUA VIP';
const BTN_USER = '👤 TÀI KHOẢN';

// --- 🛠️ CÁC HÀM KẾT NỐI DATABASE (HÃY ĐỒNG BỘ VỚI FILE DB.JSON CỦA BẠN) ---
function getUser(userId, name = 'Khách') {
    // Mẫu dữ liệu user, hãy chỉnh sửa để đọc ghi từ db.json thực tế của bạn
    return { balance: 100000, is_vip: true, vip_until: Date.now() + 86400000 }; 
}
function updateUserBalance(userId, amount) { return 100000; }
function addVipTime(userId, days) {}
function loadDB() { return {}; } // Hàm load database cũ của bạn
function checkVipStatus(userId) {
    const u = getUser(userId);
    const isVip = u && u.is_vip && (u.vip_until === 'permanent' || u.vip_until > Date.now());
    return { isVip, text: isVip ? '👑 VIP PRO' : 'Chưa đăng ký' };
}
function getVipStatusText(u) {
    if (!u.is_vip) return 'Chưa đăng ký';
    if (u.vip_until === 'permanent') return 'Vĩnh Viễn ♾️';
    return u.vip_until > Date.now() ? 'Đang kích hoạt' : 'Hết hạn';
}

// Cấu hình giao diện mẫu text bo góc
function formatHeader(title) { return `🌟 **${title}** 🌟\n━━━━━━━━━━━━━━━━━━\n`; }
function formatFooter() { return `\n━━━━━━━━━━━━━━━━━━\n👑 @Toolbcrpro_bot`; }
function mainReplyMarkup() { return Markup.keyboard([[BTN_GAME, BTN_NAP], [BTN_VIP, BTN_USER]]).resize(); }

// 🎮 DANH SÁCH 10 BÀN GAME MỞ RỘNG ĐẦY ĐỦ THEO YÊU CẦU 🎮
function tableMarkup() {
    return Markup.inlineKeyboard([
        [Markup.button.callback('🎰 BÀN 1', 'table_1'), Markup.button.callback('🎰 BÀN 2', 'table_2')],
        [Markup.button.callback('🎰 BÀN 3', 'table_3'), Markup.button.callback('🎰 BÀN 4', 'table_4')],
        [Markup.button.callback('🎰 BÀN 5', 'table_5'), Markup.button.callback('🎰 BÀN C01', 'table_c01')],
        [Markup.button.callback('🎰 BÀN C02', 'table_c02'), Markup.button.callback('🎰 BÀN C03', 'table_c03')],
        [Markup.button.callback('🎰 BÀN C04', 'table_c04'), Markup.button.callback('🎰 BÀN C05', 'table_c05')]
    ]).reply_markup;
}

// Danh sách các nút bấm mua VIP
function vipMarkup() {
    return Markup.inlineKeyboard([
        [Markup.button.callback('🎫 Gói 1 Ngày', 'buy_1d'), Markup.button.callback('🎫 Gói 3 Ngày', 'buy_3d')],
        [Markup.button.callback('💎 Gói 7 Ngày', 'buy_7d'), Markup.button.callback('👑 Gói Vĩnh Viễn', 'buy_vv')]
    ]).reply_markup;
}

// --- 🛡️ MIDDLEWARE KIỂM TRA CHẶN NGƯỜI DÙNG TOÀN CỤC ---
bot.use(async (ctx, next) => {
    if (!ctx.from) return next();
    if (blockedUsers.has(ctx.from.id)) {
        if (ctx.chat.type === 'private') {
            await ctx.reply('🔒 **Tài khoản của bạn đã bị Admin khóa khỏi hệ thống bot.**').catch(() => {});
        }
        return; 
    }
    return next();
});

// --- 🛑 LỆNH CẤM QUYỀN TRUY CẬP: /CHAN 12345 HOẶC /CHAN @USERNAME ---
bot.command('chan', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return ctx.reply('❌ Bạn không phải Admin!');
    const args = ctx.message.text.split(' ');
    if (args.length < 2) return ctx.replyWithMarkdown('⚠️ Cú pháp chặn:\n• Theo ID số: `/chan 12345678`\n• Theo Username: `/chan @phong296`');

    const target = args[1].trim();

    if (target.startsWith('@')) {
        const usernameToBlock = target.replace('@', '').toLowerCase();
        ctx.reply(`✅ Đã đưa cấu hình tài khoản \`@${usernameToBlock}\` vào danh sách cấm tự động.`);
        bot.use(async (context, next) => {
            if (context.from && context.from.username && context.from.username.toLowerCase() === usernameToBlock) {
                blockedUsers.add(context.from.id);
                delete userSubscriptions[context.from.id];
                return;
            }
            return next();
        });
        return;
    }

    const targetUserId = parseInt(target);
    if (isNaN(targetUserId)) return ctx.reply('❌ Định dạng ID không hợp lệ (Bắt buộc phải là chuỗi số).');

    blockedUsers.add(targetUserId);
    delete userSubscriptions[targetUserId];
    await ctx.reply(`✅ Đã cấm thành công ID người dùng: \`${targetUserId}\`.`);
    try { 
        await ctx.telegram.sendMessage(targetUserId, '🔒 **Tài khoản của bạn đã bị Admin chặn khỏi hệ thống!**'); 
    } catch (e) {}
});

// --- 💰 WIZARD SCENE NẠP TIỀN QUY TRÌNH CHUẨN ---
const napTienWizard = new Scenes.WizardScene(
    'nap_tien_scene',
    async (ctx) => {
        ctx.wizard.state.sotien = 50000; // Số tiền mặc định làm mẫu
        ctx.wizard.state.noidung = 'NAP TIEN';
        await ctx.reply('💳 Vui lòng chuyển khoản và gửi hình ảnh biên lai (bill) giao dịch vào đây:');
        return ctx.wizard.next();
    },
    async (ctx) => {
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

// --- 🚀 LỆNH /START GIAO DIỆN CHUẨN ĐẸP MẮT ---
bot.start((ctx) => {
    const name = ctx.from.first_name || 'Khách';
    const u = getUser(ctx.from.id, name);
    let text = formatHeader('👋 MENU CHÍNH 👋') +
               `Chào mừng **${name}**!\n` +
               `• 👤 Khách hàng: **${name}**\n` +
               `• 💰 Số dư ví: \`${u.balance.toLocaleString('vi-VN')}đ\`\n` +
               `• 👑 Kích Hoạt: ${getVipStatusText(u)}\n\n` +
               `Chọn chức năng dưới bàn phím để bắt đầu:` +
               formatFooter();
    ctx.replyWithMarkdown(text, { reply_markup: mainReplyMarkup() });
});

// --- ⚡ XỬ LÝ SỰ KIỆN PHÍM BẤM BÀN PHÍM MENU GỐC ---
bot.hears(BTN_GAME, async (ctx) => {
    const user = getUser(ctx.from.id);
    const isVip = user && user.is_vip && (user.vip_until === 'permanent' || user.vip_until > Date.now());

    if (!isVip) {
        delete userSubscriptions[ctx.from.id]; // Xóa rác bộ nhớ chặn đứng lỗi gửi bài lung tung
        return ctx.reply('🔒 Bạn cần mua VIP để sử dụng chức năng CHỌN GAME!');
    }

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
    const vipInfo = checkVipStatus(ctx.from.id);

    let text = formatHeader('✨ THÔNG TIN TÀI KHOẢN ✨') +
       `• 🆔 ID: \`${ctx.from.id}\`\n` +
       `• 💰 Số dư: \`${u.balance.toLocaleString('vi-VN')}đ\`\n` +
       `• 👑 Gói VIP: ${vipInfo.isVip ? '👑 VIP PRO' : 'Chưa đăng ký'}\n` +
       `• ⏳ Hạn dùng: ${vipInfo.text}` +
       formatFooter();
    await ctx.replyWithMarkdown(text, { reply_markup: mainReplyMarkup() });
});

// --- ⚡ XỬ LÝ TOÀN BỘ SỰ KIỆN NÚT BẤM INLINE (CALLBACK_QUERY) ---
bot.on('callback_query', async (ctx) => {
    const data = ctx.callbackQuery.data;
    const userId = ctx.from.id;
    const u = getUser(userId, ctx.from.first_name);

    // ADMIN DUYỆT TIỀN
    if (data.startsWith('admin_accept_')) {
        if (ctx.from.id !== ADMIN_ID) return ctx.answerCbQuery('❌ Bạn không phải Admin!');
        const parts = data.split('_');
        const targetUserId = parts[2];
        const amount = parseInt(parts[3]);

        // Tiến hành cộng tiền vào database của khách dựa trên tham số đã tách
        updateUserBalance(targetUserId, amount);
        
        // Cập nhật lại thanh trạng thái trên tin nhắn ảnh của Admin
        await ctx.editMessageCaption(`✅ **DUYỆT CỘNG TIỀN THÀNH CÔNG**\n• Đã cộng **+${amount.toLocaleString('vi-VN')}đ** cho ID: \`${targetUserId}\`.`, { reply_markup: null }).catch(() => {});
        
        // Gửi thông báo trực tiếp cho khách hàng
        try {
            await ctx.telegram.sendMessage(targetUserId, `🎉 **NẠP TIỀN THÀNH CÔNG** 🎉\n• Tài khoản của bạn được Admin cộng ví: **+${amount.toLocaleString('vi-VN')}đ**\n• Hệ thống đã tự động cập nhật số dư mới!`);
        } catch (e) {}

        // Gửi biên lai thông báo lịch sử giao dịch về cho Admin
        try {
            const userInfo = await ctx.telegram.getChat(targetUserId);
            const username = userInfo.username ? '@' + userInfo.username : targetUserId;

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

    // ADMIN TỪ CHỐI BILL
    if (data.startsWith('admin_decline_')) {
        if (ctx.from.id !== ADMIN_ID) return ctx.answerCbQuery('❌ Bạn không phải Admin!');
        const parts = data.split('_');
        const targetUserId = parts[2]; // Lấy chính xác ID người dùng từ chuỗi callback
        
        await ctx.editMessageCaption(`❌ **ĐÃ TỪ CHỐI BILL** cho ID: \`${targetUserId}\`.`, { reply_markup: null }).catch(() => {});
        try {
            await ctx.telegram.sendMessage(targetUserId, `❌ **HÓA ĐƠN BỊ TỪ CHỐI** ❌\n• Admin không tìm thấy giao dịch. Vui lòng kiểm tra lại banking MoMo!`);
        } catch (e) {}
        return ctx.answerCbQuery('❌ Đã từ chối!', { show_alert: true });
    }

    // USER CHỌN BÀN GAME INLINE (HỖ TRỢ TẤT CẢ 10 BÀN)
    if (data.startsWith('table_')) {
        const tableName = data.replace('table_', '').toUpperCase();
        const user = getUser(userId);
        const isVip = user && user.is_vip && (user.vip_until === 'permanent' || user.vip_until > Date.now());

        if (isVip) {
            userSubscriptions[userId] = tableName;
            await ctx.answerCbQuery(`🎯 Đã cài đặt bàn ${tableName}. Dự đoán sẽ gửi khi có PHIÊN MỚI!`, { show_alert: true });

            try {
                const res = await axios.get('https://apibcrneww.onrender.com/dudoan/sexy/all');
                const dataArray = Array.isArray(res.data) ? res.data : (res.data.data || []);
                const tableData = dataArray.find(x => String(x.ban).toUpperCase() === tableName);

                if (!tableData) {
                    return ctx.reply(`❌ Không tìm thấy dữ liệu sảnh cho Bàn ${tableName}`);
                }

                const duDoan = tableData.du_doan === 'Banker' ? '🏦 NHÀ CÁI (BANKER)' : '👤 NHÀ CON (PLAYER)';
                
                // Khai báo biến cục bộ textInline riêng biệt tránh rò rỉ biến toàn cục
                let textInline = `👑 DỰ ĐOÁN BACCARAT VIP 👑\n\n` +
                                 `🎰 Bàn: ${tableData.ban}\n` +
                                 `🎯 DỰ ĐOÁN: ${duDoan}\n` +
                                 `📊 Độ tin cậy: ${tableData.do_tin_cay}\n` +
                                 `🔥 Phiên hiện tại: ${tableData.phien_hien_tai}\n\n` +
                                 `📜 ${tableData.ket_qua.slice(-30)}`;

                const backToTable = Markup.inlineKeyboard([
                    [Markup.button.callback('🛑 DỪNG', 'stop_predict')],
                    [Markup.button.callback('↩️ Trở Lại Danh Sách', 'refresh_tables')]
                ]).reply_markup;
                
                await ctx.reply(textInline, { reply_markup: backToTable }).catch(() => {});

            } catch (err) {
                console.error(err);
                await ctx.answerCbQuery('❌ Lỗi kết nối API!', { show_alert: true });
            }
        } else {
            // Nếu phát hiện không có VIP, xóa đăng ký theo dõi ngay lập tức để tránh lỗi gửi bài lung tung
            delete userSubscriptions[userId];
            await ctx.answerCbQuery(
                `🔒 Bạn cần mua VIP để mở khóa Bàn ${tableName}!`,
                { show_alert: true }
            );
        }
    }
    else if (data === 'stop_predict') {
        delete userSubscriptions[userId];
        await ctx.answerCbQuery('🛑 Đã dừng dự đoán', { show_alert: true });

        const textStop =
            formatHeader('🎮 DANH SÁCH GAME 🎮') +
            `Vui lòng chọn bàn bạn muốn cài đặt Tool (Hỗ trợ 10 Bàn):\n` +
            `• 👑 Yêu cầu cấp bậc: VIP PRO` +
            formatFooter();

        await ctx.replyWithMarkdown(textStop, { reply_markup: tableMarkup() }).catch(() => {});
        return;
    }
    else if (data === 'refresh_tables') {
        const textRefresh =
            formatHeader('🎮 DANH SÁCH BÀN GAME 🎮') +
            `Vui lòng chọn bàn muốn xem dự đoán (Bàn 1-5 & C01-C05).\n` +
            `• Yêu cầu cấp bậc: 👑 VIP PRO` +
            formatFooter();

        await ctx.replyWithMarkdown(textRefresh, { reply_markup: tableMarkup() }).catch(() => {});
    }

    // XỬ LÝ MUA GÓI VIP CỘNG DỒN THỜI GIAN THEO SỐ DƯ TÀI KHOẢN
    else if (data.startsWith('buy_')) {
        const pack = data.replace('buy_', '');
        const prices = { '1d': 30000, '3d': 55000, '7d': 90000, 'vv': 250000 };
        const daysMapping = { '1d': 1, '3d': 3, '7d': 7, 'vv': 'permanent' };
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

// THÔNG BÁO KHI GỬI ẢNH PHOTO NGOÀI SCENE GIAO DỊCH
bot.on('photo', async (ctx) => {
    await ctx.reply('⚠️ Vui lòng nhấn nút [💳 NẠP TIỀN] dưới bàn phím trước khi gửi ảnh bill.');
});

// --- ⏳ HÀM QUÉT PHIÊN MỚI 2 GIÂY CHẠY 1 LẦN (KHÔNG BẮN TIN NHẮN CŨ LUNG TUNG) ---
async function checkNewSessions() {
    try {
        const res = await axios.get('https://apibcrneww.onrender.com/dudoan/sexy/all');
        const tables = Array.isArray(res.data) ? res.data : (res.data.data || []);

        for (const table of tables) {
            const tableKey = String(table.ban).toUpperCase(); // Đồng bộ ép kiểu chữ hoa tên bàn (Linh hoạt cả 1-5 và C01-C05)

            // Khởi tạo điểm mốc gốc ở lần chạy đầu tiên để không gửi lung tung tin nhắn cũ ván trước khi mở bot
            if (!lastSessions[tableKey]) {
                lastSessions[tableKey] = table.phien_hien_tai;
                continue;
            }

            // CHỈ KHI NÀO PHÁT HIỆN SÒNG ĐỔI SANG PHIÊN MỚI TINH MỚI BẮT ĐẦU BẮN DỰ ĐOÁN
            if (lastSessions[tableKey] !== table.phien_hien_tai) {
                lastSessions[tableKey] = table.phien_hien_tai;

                const duDoan = table.du_doan === 'Banker' ? '🏦 NHÀ CÁI (BANKER)' : '👤 NHÀ CON (PLAYER)';
                const textNotify = `👑 DỰ ĐOÁN BACCARAT VIP 👑\n\n` +
                                   `🎰 Bàn: ${table.ban}\n` +
                                   `🎯 DỰ ĐOÁN: ${duDoan}\n` +
                                   `📊 Độ tin cậy: ${table.do_tin_cay}\n` +
                                   `🔥 Phiên hiện tại: ${table.phien_hien_tai}\n` +
                                   `📜 ${table.ket_qua.slice(-30)}`;

                // Gửi cho người đang theo dõi đúng bàn
                for (const userId in userSubscriptions) {
                    if (userSubscriptions[userId] === tableKey) {
                        
                        // 🔥 LỚP KHÓA BẢO MẬT: Kiểm tra lại quyền hạn VIP thời gian thực trước khi bắn tin nhắn
                        const userDb = getUser(userId);
                        const hasVipNow = userDb && userDb.is_vip && (userDb.vip_until === 'permanent' || userDb.vip_until > Date.now());

                        // Nếu hết hạn VIP: Hủy đăng ký ngay, chặn đứng spam lung tung
                        if (!hasVipNow) {
                            delete userSubscriptions[userId];
                            try {
                                await bot.telegram.sendMessage(userId, '🔒 **Gói VIP của bạn đã hết hạn.** Hệ thống đã tự động dừng gửi dự đoán.');
                            } catch (e) {}
                            continue; // Bỏ qua user này, chuyển sang tài khoản kế tiếp trong vòng lặp
                        }

                        // Nếu ĐỦ ĐIỀU KIỆN VIP: Tiến hành đẩy kết quả phiên mới tinh kèm bàn phím inline điều hướng
                        try {
                            await bot.telegram.sendMessage(userId, textNotify, {
                                reply_markup: Markup.inlineKeyboard([
                                    [Markup.button.callback('🛑 DỪNG', 'stop_predict')],
                                    [Markup.button.callback('🎮 CHỌN BÀN', 'refresh_tables')]
                                ]).reply_markup
                            });
                        } catch (e) {}
                    }
                }
            }
        }
    } catch (err) {
        console.log('Lỗi check phiên ngầm:', err.message);
    }
}

console.log('💎 BOT TELEGRAM ĐÃ ĐỒNG BỘ ĐẦY ĐỦ ICON VÀ GIAO DIỆN TÀI KHOẢN CHUẨN XỊN!');

// Chạy hàm quét phiên ngầm định kỳ mỗi 2 giây
setInterval(checkNewSessions, 2000);

// Khởi chạy bot ở chế độ Long Polling bình thường
bot.launch().then(() => {
    console.log('🚀 Bot đã khởi chạy ở chế độ Polling!');
});

// ===== EXPRESS CHO RENDER (ĐÃ LÀM SẠCH LỖI LẶP CODE) =====
const app = express(); 

app.get('/', (req, res) => {
    res.send('Bot Telegram Online (Polling Mode)');
});

const PORT = process.env.PORT || 3000;
const URL_DONG_BO = process.env.RENDER_EXTERNAL_URL || '';

app.listen(PORT, () => {
    console.log(`Server Express chạy thành công ở cổng ${PORT}`);
    
    // Tự động Ping hệ thống định kỳ chống Sleep Mode Free Tier trên Render
    if (URL_DONG_BO) {
        setInterval(async () => {
            try {
                await axios.get(URL_DONG_BO);
                console.log('🔄 Đã tự động re-ping giữ bot luôn thức 24/7.');
            } catch (err) {
                console.log('⚠️ Ping duy trì lỗi: ', err.message);
            }
        }, 5 * 60 * 1000); // Tự động ping mỗi 5 phút
    }
});

// Khởi tạo các tín hiệu dừng tiến trình an toàn khi restart server hệ thống
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
