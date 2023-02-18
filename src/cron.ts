import {CronJob} from "cron";
import {bot, notify} from "./bot";
import {config} from "./config";
import dayjs, {ManipulateType} from "dayjs";
import {prisma} from "./db/db";
import {formatDeadlineEntry} from "./format";

const remindersConfig: { value: number, unit: ManipulateType, name: string }[] = [
    {value: 0, unit: 'minute', name: 'Прямо сейчас'},
    {value: 1, unit: 'hour', name: 'Через час'},
]

export async function defineJobs() {
    // Daily reminder
    new CronJob(
        '0 6 * * *',
        function () {
            notify(config.config.bot.notifications.chat_id);
        },
        null,
        true,
    )
    new CronJob(
        '* * * * *',
        async function () {
            console.info('Checking deadlines')
            for (const rem of remindersConfig) {
                const code = [rem.value, rem.unit].join('_')
                const unremindedDeadlines = await prisma
                    .deadlineEntry
                    .findMany({
                        where: {
                            AND: [
                                {
                                    datetime: {
                                        gte: dayjs().toDate()
                                    },
                                },
                                {
                                    datetime: {
                                        lte: dayjs().add(rem.value, rem.unit).toDate()
                                    }
                                },
                                {
                                    reminders: {
                                        none: {
                                            title: {
                                                equals: code
                                            }
                                        }
                                    }
                                }
                            ]
                        }
                    })
                for (const deadline of unremindedDeadlines) {
                    await bot.telegram.sendMessage(
                        config.config.bot.notifications.chat_id,
                        'Скоро дедлайн! (триггер: ' + rem.name + ')' + dayjs(deadline.datetime).fromNow() + ':\n' + formatDeadlineEntry(deadline, false),
                        {
                            parse_mode: 'HTML'
                        }
                    )
                    await prisma.deadlineEntry.update({
                        where: {
                            id: deadline.id
                        },
                        data: {
                            reminders: {
                                create: {
                                    title: code
                                }
                            }
                        }
                    })
                }
            }
        },
        null,
        true
    )
}