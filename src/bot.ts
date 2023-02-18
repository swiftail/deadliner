import {Markup, Telegraf} from "telegraf";
import {Machine, sm} from 'jssm';
import {config} from "./config";
import Joi from 'joi'
import dayjs from "dayjs";
import {formatDeadlineEntries, formatDeadlineEntry} from "./format";
import {randomUUID} from "crypto";
import {prisma} from "./db/db"; // Added in: node v14.17.0


const states: Map<string, Machine<any>> = new Map()

function createStateMachine(chatId: number, userId: number) {
    const userData = {
        chatId,
        userId,
        input: {
            subject: undefined,
            title: undefined,
            datetime: undefined,
            link: undefined,
            description: undefined,
            completed: false
        }
    }
    const machine: Machine<typeof userData> = sm`
    machine_name: "User state";
    
    property accept_input default false;

    Empty                   'InitDeadline'        -> EnterDeadlineProperties;
    EnterDeadlineProperties 'ValidateDeadline'    => EnterDeadlineConfirm;
    EnterDeadlineProperties 'ResumeDeadline'      => EnterDeadlineProperties;
    EnterDeadlineConfirm    'EndDeadlineCreation' => Empty;
    
    state EnterDeadlineProperties:  { property: accept_input true; }; 
    `
    machine._data = userData

    machine.hook_entry('EnterDeadlineProperties', ctx => {
        switch (true) {
            case ctx.data.input.subject === undefined:
                bot.telegram.sendMessage(userData.chatId, 'Введите предмет:');
                break;
            case ctx.data.input.title === undefined:
                bot.telegram.sendMessage(userData.chatId, 'Введите заголовок:');
                break;
            case ctx.data.input.datetime === undefined:
                bot.telegram.sendMessage(userData.chatId, 'Введите дату и время: (DD.MM.YY HH:mm)');
                break;
            case ctx.data.input.description === undefined:
                bot.telegram.sendMessage(userData.chatId, 'Введите описание  (либо - для пропуска)::');
                break;
            case ctx.data.input.link === undefined:
                bot.telegram.sendMessage(userData.chatId, 'Введите ссылку (либо - для пропуска):');
                break;
        }
    })

    machine.hook_global_action('EndDeadlineCreation', ctx => {
        const data = ctx.data
        data.input = {
            subject: undefined,
            title: undefined,
            datetime: undefined,
            link: undefined,
            description: undefined,
            completed: false
        }
        ctx.next_data = data
    })
    machine.hook_entry('EnterDeadlineConfirm', ctx => {
        const buttons = Markup.inlineKeyboard([
            [Markup.button.callback('Отменить', 'new_callback_cancel')],
            [Markup.button.callback('Сохранить', 'new_callback_save')]
        ])
        bot.telegram.sendMessage(
            userData.chatId,
            `
<b>Подтвердите создание дедлайна:</b>

+ <i>Предмет:</i> ${ctx.data.input.subject}
+ <i>Название:</i> ${ctx.data.input.title}
+ <i>Дата и время:</i> ${ctx.data.input.datetime.format('DD.MM.YYYY HH:mm')}
+ <i>Ссылка:</i> ${ctx.data.input.link ?? '<i>Не указана</i>'}
+ <i>Описание:</i> ${ctx.data.input.description}
            `.trim(),
            {
                parse_mode: 'HTML',
                reply_markup: buttons.reply_markup
            }
        )
    })

    return machine
}

function getStateIdentifier(chatId: number, userId: number) {
    return `chat${chatId}_user${userId}`
}

function getStateMachine(ctx: any): Machine<any> {
    const id = getStateIdentifier(ctx.chat.id, ctx.from.id)
    if (!states.has(id)) {
        states.set(id, createStateMachine(ctx.chat.id, ctx.from.id))
    }
    return states.get(id)
}

async function getEntries(from: dayjs.Dayjs | null, to: dayjs.Dayjs | null) {
    let query = prisma
        .deadlineEntry
        .findMany({
            where: {
                datetime: {
                    gte: (from ? from.toDate() : undefined),
                    lte: (to ? to.toDate() : undefined)
                }
            },
            orderBy: {
                datetime: 'asc'
            }
        })

    return await query
}

export const bot = new Telegraf(config.config.bot.token);

bot.command("all", async ctx => {
    const deadlines = await getEntries(dayjs(), null)
    ctx.reply('<b>Список хуйни:</b>\n' + formatDeadlineEntries(deadlines), {
        parse_mode: 'HTML'
    })
})

bot.command("xlist", async ctx => {
    if (!config.config.bot.admins.includes(String(ctx.from.id))) {
        ctx.reply('Нет прав :(')
        return
    }
    const deadlines = await getEntries(dayjs(), null)
    ctx.reply('<b>Список хуйни:</b>\n' + formatDeadlineEntries(deadlines, true), {
        parse_mode: 'HTML'
    })
})
bot.command("elist", async ctx => {
    if (!config.config.bot.admins.includes(String(ctx.from.id))) {
        ctx.reply('Нет прав :(')
        return
    }
    const deadlines = await getEntries(null, null)
    ctx.reply('<b>Список хуйни:</b>\n' + formatDeadlineEntries(deadlines, true), {
        parse_mode: 'HTML'
    })
})

bot.action('new_callback_cancel', async ctx => {
    const m = getStateMachine(ctx)
    if (m.valid_action('EndDeadlineCreation')) {
        await ctx.reply('Создание дедлайна отменено')
        m.action('EndDeadlineCreation')
    }
    ctx.answerCbQuery()
})

bot.action('new_callback_continue', ctx => {
    const m = getStateMachine(ctx)
    if (m.valid_action('ResumeDeadline')) {
        m.action('ResumeDeadline')
    }
    ctx.answerCbQuery()
})

bot.action('new_callback_save', async ctx => {
    const m = getStateMachine(ctx)
    if (m.valid_action('EndDeadlineCreation')) {
        await ctx.reply('Сохранение дедлайна...')
        const {subject, title, link, datetime, description} = m.data().input

        const entry = await prisma.deadlineEntry.create({
            data: {
                subject: m.data().input.subject,
                title: m.data().input.title,
                datetime: m.data().input.datetime.toDate(),
                link: m.data().input.link ?? undefined,
                description: m.data().input.description ?? undefined,
            }
        })
        m.action('EndDeadlineCreation')
        await ctx.reply(formatDeadlineEntry(entry), {
            parse_mode: 'HTML'
        })
        await bot.telegram.sendMessage(config.config.bot.notifications.chat_id, 'Добавлена новая запись:\n'+formatDeadlineEntry(entry), {
            parse_mode: 'HTML'
        })
    }
    ctx.answerCbQuery()
})

bot.command("new", async ctx => {
    if (!config.config.bot.admins.includes(String(ctx.from.id))) {
        console.info(ctx.from.id)
        ctx.reply('Нет прав :(')
        return
    }
    const m = getStateMachine(ctx)
    if (m.valid_action('InitDeadline')) {
        m.action('InitDeadline')
    } else {
        const buttons = Markup.inlineKeyboard([
            [Markup.button.callback('Отменить', 'new_callback_cancel')],
            [Markup.button.callback('Продолжить', 'new_callback_continue')]
        ])

        ctx.reply('Вы находитесь в процессе создания дедлайна. Начать заново?', {
            reply_markup: buttons.reply_markup
        })
    }
})

bot.command('remind', async ctx => {
    await notify(ctx.chat.id)
})

bot.command('100', async ctx => {
    ctx.reply(`100! = 93326215443944152681699238856266700490715968264381621468592963895217599993229915608941463976156518286253697920827223758251185210916864000000000000000000000000`)
})

bot.hears('да', ctx => ctx.sendVoice(
    { source: './assets/pizda.ogg' }
))

bot.on('text', async ctx => {
    const m = getStateMachine(ctx)
    if (m.prop('accept_input')) {
        const data = m.data()

        switch (true) {
            case data.input.subject === undefined: {
                data.input.subject = ctx.message.text
                m.action('ResumeDeadline', data)
                break;
            }
            case data.input.title === undefined: {
                data.input.title = ctx.message.text
                m.action('ResumeDeadline', data)
                break;
            }
            case data.input.datetime === undefined: {
                const input = ctx.message.text
                const validationResult = Joi
                    .string()
                    .regex(/\d{2}\.\d{2}\.\d{2} \d{2}:\d{2}/)
                    .validate(input)

                if (validationResult.error) {
                    await ctx.reply('Неверный формат даты.')
                } else {
                    const date = dayjs(input, 'DD.MM.YY HH:mm')
                    if (!date.isValid()) {
                        await ctx.reply('Неверная дата.')
                    } else {
                        data.input.datetime = date
                        m.action('ResumeDeadline', data)
                    }
                }
                break;
            }
            case data.input.description === undefined: {
                if (ctx.message.text.trim() === '-') {
                    data.input.description = null
                    m.action('ResumeDeadline', data)
                } else {
                    data.input.description = ctx.message.text
                    m.action('ResumeDeadline', data)
                }
                break;
            }
            case data.input.link === undefined: {
                const input = ctx.message.text
                const validationResult = Joi
                    .string()
                    .uri()
                    .validate(input)

                if (input.trim() === '-') {
                    data.input.link = null
                    m.action('ValidateDeadline', data)
                } else if (validationResult.error) {
                    await ctx.reply('Неверная ссылка.')
                } else {
                    data.input.link = input
                    m.action('ValidateDeadline', data)
                }
                break;
            }
        }

    }
})

bot.catch((err, ctx) => {
    console.error(err)
})

export async function notify(chatId) {
    const deadlines = await getEntries(dayjs(), dayjs().add(7, 'day'))
    await bot.telegram.sendMessage(
        chatId,
        '<b>Напоминание о дедлайнах:</b>\n\n' + formatDeadlineEntries(deadlines, false),
        {
            parse_mode: 'HTML'
        }
    )
}