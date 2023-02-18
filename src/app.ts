import {config} from "./config";

import dayjs from 'dayjs'
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import relativeTime from "dayjs/plugin/relativeTime"
import customParseFormat from "dayjs/plugin/customParseFormat"
import 'dayjs/locale/ru'

dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.extend(customParseFormat)
dayjs.extend(relativeTime)
dayjs.locale('ru')

import {initDB, prisma} from "./db/db";
import Koa from 'koa';
import bodyParser from 'koa-bodyparser';
import cors from '@koa/cors';
import helmet from 'koa-helmet';
import json from 'koa-json';
import logger from 'koa-logger';
import {bot} from "./bot";
import Router from "koa-router";
import {defineJobs} from "./cron";

const app = new Koa();
const port = process.env.PORT || 3000;

app.use(helmet());
app.use(cors());
app.use(json());
app.use(logger());
app.use(bodyParser());

async function main () {
    if (config.config.bot.webhooks.enabled) {
        const router = new Router()
        const botMiddleware = (await bot.createWebhook({domain: config.config.bot.webhooks.domain}))
        router.use('/webhook', async (ctx, next) => {
            await botMiddleware(ctx.req, ctx.res, next)
        })
        app.use(router.routes()).use(router.allowedMethods())
        await app.listen()
    } else {
        bot.launch()
    }

    await bot.telegram.sendMessage(config.config.bot.notifications.chat_id, '😎 понский пон 😎', {
        parse_mode: 'HTML'
    })
    await defineJobs()

}

main()
    .then(async () => {
        await prisma.$disconnect()
    })
    .catch(async (e) => {
        console.error(e)
        await prisma.$disconnect()
        process.exit(1)
    })