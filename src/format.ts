import  dayjs from "dayjs";
import type {DeadlineEntry} from '@prisma/client'

export function formatDeadlineEntry(entry: DeadlineEntry, showId = false) {
    const {id, subject, title, datetime, link, description} = entry
    const djs = dayjs(datetime)
    const now = dayjs()

    const data = []

    if (now.isSame(djs, 'day')) {
        data.push(`☠️ <b>СЕГОДНЯ</b> ☠️`)
    }
    if (now.add(1, 'day').isSame(djs, 'day')) {
        data.push(`👺 <b>ЗАВТРА</b> 👺`)
    }

    data.push(
        `✨ <b>${subject}</b> - ${title} ✨`,
        `${djs.format('DD.MM.YY HH:mm')} <i>(${djs.fromNow()})</i>`,
    )
    if (showId) {
        data.push(`<code>${id}</code>`)
    }
    if (description) {
        data.push(`${description}`)
    }
    if (link) {
        data.push(`${link}`)
    }

    return data.join(`\n`)
}

export function formatDeadlineEntries(entries: DeadlineEntry[], showId = false) {
    return entries.reduce(
        (prev, cur, idx) => {
            return prev + (idx + 1) + '. ' + formatDeadlineEntry(cur) + '\n\n'
        },
        ''
    ).trim()
}