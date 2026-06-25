const { Telegraf, Scenes, session, Markup } = require('telegraf');
const axios = require('axios');
const express = require('express');

// --- ⚙️ CẤU HÌNH BIẾN MÔI TRƯỜNG BẢO MẬT ---
// Không viết trực tiếp token vào đây để tránh bị lộ. Hãy điền trên Dashboard của Render!
const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_ID = parseInt(process.env.ADMIN_ID || '7338417401'); // Thay bằng ID Admin thật của bạn

if (!BOT_TOKEN) {
    console.error('❌ LỖI NGHIÊM TRỌNG: Chưa cấu hình biến môi trường BOT_TOKEN trên Render!');
    process.exit(1);
}

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

// --- 🛠️ CÁC HÀM KẾT NỐI DATABASE (BẠN ĐỒNG BỘ VỚI FILE DB.JSON CỦA BẠN) ---
function getUser(userId, name = 'Khách') {
    // Mẫu dữ liệu user, hãy chỉnh sửa để đọc ghi từ db.json thực tế của bạn
    return { balance: 100000, is_vip: true, vip_until: Date.now() + 86400000 }; 
}
function updateUserBalance(userId, amount) { return 100000; }
function addVipTime(userId, days) {}
function checkVipStatus(userId) {
    const u = getUser(userId);
    const isVip = u && u.is_vip && (u.vip_until === 'permanent' || u.vip_until > Date.now());
    return { isVip, text: isVip ? '<b>👑 VIP PRO</b>' : 'Chưa đăng ký' };
}
function getVipStatusText(u) {
    if (!u.is_vip) return 'Chưa đăng ký';
    if (u.vip_until === 'permanent') return 'Vĩnh Viễn ♾️';
    return u.vip_until > Date.now() ? 'Đang kích hoạt' : 'Hết hạn';
}

// Cấu hình giao diện mẫu text dạng HTML để CHỐNG SẬP BOT
function formatHeader(title) { return `🌟 <b>${title}</b> 🌟\n━━━━━━━━━━━━━━━━━━\n`; }
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
            await ctx.reply('🔒 <b>Tài khoản của bạn đã bị Admin khóa khỏi hệ thống bot.</b>', { parse_mode: 'HTML' }).catch(() => {});
        }
        return; 
    }
    return next();
});

// --- 🛑 LỆNH CẤM QUYỀN TRUY CẬP: /CHAN 12345 HOẶC /CHAN @USERNAME ---
bot.command('chan', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return ctx.reply('❌ Bạn không phải Admin!');
    const args = ctx.message.text.split(' ');
    if (args.length < 2) return ctx.replyWithHTML('⚠️ Cú pháp chặn:\n• Theo ID số: <code>/chan 12345678</code>\n• Theo Username: <code>/chan @phong296</code>');

    const target = args[1].trim();

    if (target.startsWith('@')) {
        const usernameToBlock = target.replace('@', '').toLowerCase();
        ctx.replyWithHTML(`✅ Đã đưa cấu hình tài khoản <code>@${usernameToBlock}</code> vào danh sách cấm tự động.`);
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
    await ctx.replyWithHTML(`✅ Đã cấm thành công ID người dùng: <code>${targetUserId}</code>.`);
    try { 
        await ctx.telegram.sendMessage(targetUserId, '🔒 <b>Tài khoản của bạn đã bị Admin chặn khỏi hệ thống!</b>', { parse_mode: 'HTML' }); 
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
            await ctx.reply('⚠️ Vui lòng gửi ảnh bill chuyển khoản để tiếp tục.');
            return;
        }

        const name = ctx.from.first_name || 'Khách';
        const userId = ctx.from.id;
        const sotien = ctx.wizard.state.sotien;
        const fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
        const noidung = ctx.wizard.state.noidung;
        await ctx.replyWithHTML(`✅ <b>Đã gửi hóa đơn!</b> Vui lòng đợi 1-3 phút để Admin duyệt tiền.`, { reply_markup: mainReplyMarkup() });

        try {
            const adminButtons = Markup.inlineKeyboard([
                [Markup.button.callback('✅ DUYỆT', `admin_accept_${userId}_${sotien}`), Markup.button.callback('❌ TỪ CHỐI', `admin_decline_${userId}`)]
            ]).reply_markup;

            await ctx.telegram.sendPhoto(ADMIN_ID, fileId, {
                caption: `🚨 <b>BILL NẠP TIỀN MỚI</b> 🚨\n• Khách: ${name}\n• ID: <code>${userId}</code>\n• Số tiền: <b>${sotien.toLocaleString('vi-VN')}đ</b>\n• Nội dung CK: <code>${noidung}</code>`,
                parse_mode: 'HTML',
                reply_markup: adminButtons
            });
        } catch (error) { console.error(error); }
        return ctx.scene.leave();
    }
);

const stage = new Scenes.Stage([napTienWizard]);
bot.use(session());
bot.use(stage.middleware());

// --- 🚀 LỆNH /START GIAO DIỆN CHUẨN ĐẸP MẮT ---
bot.start((ctx) => {
    const name = ctx.from.first_name || 'Khách';
    const u = getUser(ctx.from.id, name);
    let text = formatHeader('👋 MENU CHÍNH 👋') +
               `Chào mừng <b>${name}</b>!\n` +
               `• 👤 Khách hàng: <b>${name}</b>\n` +
               `• 💰 Số dư ví: <code>${u.balance.toLocaleString('vi-VN')}đ</code>\n` +
               `• 👑 Kích Hoạt: ${getVipStatusText(u)}\n\n` +
               `Chọn chức năng dưới bàn phím để bắt đầu:` +
               formatFooter();
    ctx.replyWithHTML(text, { reply_markup: mainReplyMarkup() }).catch((e) => console.error(e));
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
           `• 👑 Yêu cầu cấp bậc: <b>VIP PRO</b>` +
           formatFooter();

    await ctx.replyWithHTML(text, { reply_markup: tableMarkup() });
});

bot.hears(BTN_NAP, async (ctx) => {
    await ctx.scene.enter('nap_tien_scene');
});

bot.hears(BTN_VIP, async (ctx) => {
    let text = formatHeader('👑 BẢNG GIÁ VIP 👑') +
           `Mua gói VIP để mở khóa toàn bộ game:\n\n` +
           `• 🎫 Gói 1 Ngày ── Giá: <code>30.000đ</code> ⚡\n` +
           `• 🎫 Gói 3 Ngày ── Giá: <code>55.000đ</code> 🔥\n` +
           `• 💎 Gói 7 Ngày ── Giá: <code>90.000đ</code> ✨\n` +
           `• 👑 Vĩnh Viễn  ── Giá: <code>250.000đ</code> 🏆\n\n` +
           `👉 Bấm nút tương ứng bên dưới để mua:`;
    await ctx.replyWithHTML(text, { reply_markup: vipMarkup() });
});

bot.hears(BTN_USER, async (ctx) => {
    const u = getUser(ctx.from.id, ctx.from.first_name);
    const vipInfo = checkVipStatus(ctx.from.id);

    let text = formatHeader('✨ THÔNG TIN TÀI KHOẢN ✨') +
       `• 🆔 ID: <code>${ctx.from.id}</code>\n` +
       `• 💰 Số dư: <code>${u.balance.toLocaleString('vi-VN')}đ</code>\n` +
       `• 👑 Gói VIP: ${vipInfo.isVip ? '<b>👑 VIP PRO</b>' : 'Chưa đăng ký'}\n` +
       `• ⏳ Hạn dùng: ${vipInfo.text}` +
       formatFooter();
    await ctx.replyWithHTML(text, { reply_markup: mainReplyMarkup() });
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
        await ctx.editMessageCaption(`✅ <b>DUYỆT CỘNG TIỀN THÀNH CÔNG</b>\n• Đã cộng <b>+${amount.toLocaleString('vi-VN')}đ</b> cho ID: <code>${targetUserId}</code>.`, { parse_mode: 'HTML', reply_markup: null }).catch(() => {});
        
        // Gửi thông báo trực tiếp cho khách hàng
        try {
            await ctx.telegram.sendMessage(targetUserId, `🎉 <b>NẠP TIỀN THÀNH CÔNG</b> 🎉\n• Tài khoản của bạn được Admin cộng ví: <b>+${amount.toLocaleString('vi-VN')}đ</b>\n• Hệ thống đã tự động cập nhật số dư mới!`, { parse_mode: 'HTML' });
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

    // --- ADMIN TỪ CHỐI BILL ---
    if (data.startsWith('admin_decline_')) {
        if (ctx.from.id !== ADMIN_ID) return ctx.answerCbQuery('❌ Bạn không phải Admin!');
        const parts = data.split('_');
        const targetUserId = parts[2]; // Lấy chính xác ID người dùng ở vị trí index 2
        
        await ctx.editMessageCaption(`❌ <b>ĐÃ TỪ CHỐI BILL</b> cho ID: <code>${targetUserId}</code>.`, { parse_mode: 'HTML', reply_markup: null }).catch(() => {});
        try {
            await ctx.telegram.sendMessage(targetUserId, `❌ <b>HÓA ĐƠN BỊ TỪ CHỐI</b> ❌\n• Admin không tìm thấy giao dịch. Vui lòng kiểm tra lại banking MoMo!`, { parse_mode: 'HTML' });
        } catch (e) {}
        return ctx.answerCbQuery('❌ Đã từ chối!', { show_alert: true });
    }

    // --- USER CHỌN BÀN GAME INLINE (HỖ TRỢ TẤT CẢ 10 BÀN) ---
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
                
                let textInline = formatHeader('👑 DỰ ĐOÁN BACCARAT VIP 👑') +
                                 `🎰 Bàn: <b>${tableData.ban}</b>\n` +
                                 `🎯 DỰ ĐOÁN: <b>${duDoan}</b>\n` +
                                 `📊 Độ tin cậy: <code>${tableData.do_tin_cay}</code>\n` +
                                 `🔥 Phiên hiện tại: <code>${tableData.phien_hien_tai}</code>\n\n` +
                                 `📜 Dây cầu: <code>${tableData.ket_qua.slice(-30)}</code>`;

                const backToTable = Markup.inlineKeyboard([
                    [Markup.button.callback('🛑 DỪNG', 'stop_predict')],
                    [Markup.button.callback('↩️ Trở Lại Danh Sách', 'refresh_tables')]
                ]).reply_markup;
                
                await ctx.reply(textInline, { parse_mode: 'HTML', reply_markup: backToTable }).catch(() => {});

            } catch (err) {
                console.error(err);
                await ctx.answerCbQuery('❌ Lỗi kết nối API!', { show_alert: true });
            }
        } else {
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
            `• 👑 Yêu cầu cấp bậc: <b>VIP PRO</b>` +
            formatFooter();

        await ctx.replyWithHTML(textStop, { reply_markup: tableMarkup() }).catch(() => {});
        return;
    }
    else if (data === 'refresh_tables') {
        const textRefresh =
            formatHeader('🎮 DANH SÁCH BÀN GAME 🎮') +
            `Vui lòng chọn bàn muốn xem dự đoán (Bàn 1-5 & C01-C05).\n` +
            `• Yêu cầu cấp bậc: 👑 <b>VIP PRO</b>` +
            formatFooter();

        await ctx.replyWithHTML(textRefresh, { reply_markup: tableMarkup() }).catch(() => {});
    }

    // --- XỬ LÝ MUA GÓI VIP THEO SỐ DƯ TÀI KHOẢN ---
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
                           `• 🆔 ID: <code>${userId}</code>\n` +
                           `• 💰 Số dư: <code>${updatedUser.balance.toLocaleString('vi-VN')}đ</code>\n` +
                           `• 👑 Gói VIP: <b>👑 VIP PRO</b>\n` +
                           `• ⏳ Hạn dùng: ${newVipInfo.text}` + 
                           formatFooter();
            await ctx.replyWithHTML(textUser, { reply_markup: mainReplyMarkup() });
        } else {
            await ctx.answerCbQuery(`❌ Thất bại! Bạn cần tối thiểu ${price.toLocaleString('vi-VN')}đ để mua gói này. Vui lòng nạp tiền!`, { show_alert: true });
        }
    }
});

// --- THÔNG BÁO KHI GỬI ẢNH PHOTO NGOÀI SCENE GIAO DỊCH ---
bot.on('photo', async (ctx) => {
    await ctx.reply('⚠️ Vui lòng nhấn nút [💳 NẠP TIỀN] dưới bàn phím trước khi gửi ảnh bill.');
});

// --- ⏳ HÀM QUÉT PHIÊN MỚI 2 GIÂY CHẠY 1 LẦN (KHÔNG BẮN TIN NHẮN CŨ LUNG TUNG) ---
async function checkNewSessions() {
    try {
        const res = await axios.get('https://apibcrneww.onrender.com/dudoan/sexy/all');
        const tables = Array.isArray(res.data) ? res.data : (res.data.data || []);

        for (const table of tables) {
            const tableKey = String(table.ban).toUpperCase();

            // Khởi tạo điểm mốc gốc ở lần chạy đầu tiên để không gửi lung tung tin cũ ván trước khi mở bot
            if (!lastSessions[tableKey]) {
                lastSessions[tableKey] = table.phien_hien_tai;
                continue;
            }

            // CHỈ KHI NÀO PHÁT HIỆN SÒNG ĐỔI SANG PHIÊN MỚI TINH MỚI BẮT ĐẦU BẮN DỰ ĐOÁN
            if (lastSessions[tableKey] !== table.phien_hien_tai) {
                lastSessions[tableKey] = table.phien_hien_tai;

                const duDoan = table.du_doan === 'Banker' ? '🏦 NHÀ CÁI (BANKER)' : '👤 NHÀ CON (PLAYER)';
                const textNotify = formatHeader('👑 DỰ ĐOÁN BACCARAT VIP 👑') +
                                   `🎰 Bàn: <b>${table.ban}</b>\n` +
                                   `🎯 DỰ ĐOÁN: <b>${duDoan}</b>\n` +
                                   `📊 Độ tin cậy: <code>${table.do_tin_cay}</code>\n` +
                                   `🔥 Phiên hiện tại: <code>${table.phien_hien_tai}</code>\n` +
                                   `📜 Dây cầu: <code>${table.ket_qua.slice(-30)}</code>`;

                // Gửi cho người đang theo dõi đúng bàn
                for (const userId in userSubscriptions) {
                    if (userSubscriptions[userId] === tableKey) {
                        
                        // KHÓA BẢO MẬT VIP THỜI GIAN THỰC
                        const userDb = getUser(userId);
                        const hasVipNow = userDb && userDb.is_vip && (userDb.vip_until === 'permanent' || userDb.vip_until > Date.now());

                        if (!hasVipNow) {
                            delete userSubscriptions[userId];
                            try {
                                await bot.telegram.sendMessage(userId, '🔒 <b>Gói VIP của bạn đã hết hạn.</b> Hệ thống đã tự động dừng gửi dự đoán.', { parse_mode: 'HTML' });
                            } catch (e) {}
                            continue;
                        }

                        try {
                            await bot.telegram.sendMessage(userId, textNotify, {
                                parse_mode: 'HTML',
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

// ===== EXPRESS WEB TRẢ PORT ĐỂ RENDER KHÔNG CRASH =====
// Không khai báo lại const express nữa để tránh lỗi trùng lặp Identifier
const app = express();

app.get('/', (req, res) => {
    res.send('Bot Telegram Online');
});

const PORT = process.env.PORT || 3000;
const URL_DONG_BO = process.env.RENDER_EXTERNAL_URL || '';

app.listen(PORT, () => {
    console.log(`Server chạy cổng ${PORT}`);
    
    // Tự động Ping hệ thống định kỳ để duy trì trạng thái thức (Chống Sleep Mode Free Tier trên Render)
    if (URL_DONG_BO) {
        setInterval(async () => {
            try {
                await axios.get(URL_DONG_BO);
                console.log('🔄 Đã ping giữ server hoạt động liên tục chống ngủ đông.');
            } catch (err) {
                console.log('⚠️ Re-ping lỗi: ', err.message);
            }
        }, 5 * 60 * 1000); // Tự động ping mỗi 5 phút
    }
});

// Khởi tạo các tín hiệu dừng tiến trình an toàn khi restart server hệ thống
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
