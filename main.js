// Standard lib imports
const fs = require('fs')

// Discord.JS imports
const config = require('./config.json')
const {Client, Intents, Collection, MessageActionRow, MessageButton, MessageEmbed } = require('discord.js')
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');

// Reddit imports
const snoowrap = require('snoowrap')

// Database imports
const dbType = 'maria'
const mariadb = require('mariadb')
const oracledb = require('oracledb')
const dbConfig = require('./dbconfig')


// Cron & Cronitor imports
const CronJob = require('cron').CronJob
const cronitor = require('cronitor')(config.cronitor.apikey)

// Utility imports (npm-packages)
const date = require('date-and-time')
const moment = require('moment')
const axios = require('axios')

const BOT_VERSION = '2.2.0'

class Database {
    constructor(config) {
        this.config = config
    }

    async printTables() { }

    async setupDatabase(){ }

    async putSubmission(submissionId, subredditName, status) { }

    async putRedditor(userName, userId) { }

    async putMessageBatch(batch) { }

    async isAlreadySubmitted(submissionId) { }

    async getSubmissionId(messageId, channelId) { }

    async getMessage(discord, submissionId) { }

    async isMessageInDatabase(messageId){ }

    async deleteMessage(messageId) { }

    async getChannelIds(submissionId) { }

    async getSubredditName(submissionId) { }

    async putPinnedMessage(messageId, threadId, guildId, userId, submissionId) { }

    async countPinnedMessage(userId) { }

    async getUpdatePinnedSubmissions() { }

    async deletePinnedSubmission(threadId) { }

    async getMessageIds(submissionId) { }

    async updateMessage(submissionId, timestamp) { }

    async updatePost(submissionId, timestamp, status) { }
}

class DatabaseMariadb extends Database {
    constructor(config) {
        super(config);
        this.pool = mariadb.createPool({
            host: this.config.database.host,
            port: this.config.database.port,
            user: this.config.database.user,
            password: this.config.database.password,
            database: this.config.database.database,
            connectionLimit: this.config.database.connectionLimit
        })
    }

    async printTables() {
        let connection
        try {
            console.log('Establishing database connection')
            connection = await this.pool.getConnection()
            console.log('Established')
            const rows = await connection.query('Show Tables')
            console.log(`Tables: ${rows.length}`)
            for (let entry of rows){
                console.log(`>  ${entry[`Tables_in_${this.config.database.database}`]}`)
            }
            console.log(`Database version: ${connection.serverVersion()}`)
        } catch (err) {
            console.error(err)
            throw err
        } finally {
            if (connection) await connection.end()
        }
    }

    async setupDatabase(){
        let connection
        try{
            // Get connection
            connection = await this.pool.getConnection()

            // Create submissions table
            const submissionsResult = await connection.query(`create table submissions( id number(10) generated always as identity(start with 1 increment by 1),
                                                                      submission_id   varchar2(10) unique not null,
                                                                      subreddit       varchar2(64),
                                                                      status          varchar2(64),
                                                                      created_at      timestamp default current_timestamp,
                                                                      updated_at      timestamp default current_timestamp
                                                              )`
            )
            console.debug('Creating table pinned_submission: ', submissionsResult)

            // Create messages table
            const messagesResult = await connection.query(`create table messages(
                                                                  id number(10) generated always as identity(start with 1 increment by 1) primary key,
                                                                  message_id varchar2(64) unique not null,
                                                                  channel_id varchar2(64) unique not null,
                                                                  guild_id varchar2(64) unique not null,
                                                                  submission_id varchar2(64) unique not null,
                                                                  created_at timestamp default current_timestamp,
                                                                  updated_at timestamp default current_timestamp
                                                           )`
            )
            console.debug('Creating table pinned_submission: ', messagesResult)

            // Create redditor table
            const redditorsResult = await connection.query(`create table redditors(
                                                                   id number(10) generated always as identity(start with 1 increment by 1) primary key,
                                                                   user_name varchar2(64) unique not null,
                                                                   user_id varchar2(64) unique not null,
                                                                   request_count number(10) default 0,
                                                                   created_at timestamp default current_timestamp,
                                                                   updated_at timestamp default current_timestamp
                                                            )`
            )
            console.debug('Creating table pinned_submission: ', redditorsResult)

            // Create pinned messages table
            const pinnedSubmissionResult = await connection.query(`CREATE TABLE IF NOT EXISTS pinned_submissions(
                                            id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
                                            message_id VARCHAR(25) UNIQUE,
                                            thread_id TINYTEXT,
                                            guild_id TINYTEXT,
                                            user_id TINYTEXT,
                                            submission_id TINYTEXT,
                                            update_count INTEGER DEFAULT 1,
                                            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                                            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                                             )`
            )
            console.debug('Creating table pinned_submission: ', pinnedSubmissionResult)

        }catch (err){
            throw err
        } finally {
            if (connection) await connection.end()
        }
    }

    async putSubmission(submissionId, subredditName, status) {
        let connection
        try {
            connection = await this.pool.getConnection()
            const result = await connection.query(`INSERT INTO submissions(submission_id, subreddit, status) VALUES (?, ?, ?)`,
                [submissionId, subredditName, status])
            console.debug('Putting submission: ', result)
        } catch (err) {
            throw err
        } finally {
            if (connection) await connection.end()
        }
    }

    async putRedditor(userName, userId) {

        let connection
        try {
            connection = await this.pool.getConnection()
            const result = await connection.query(
                'INSERT INTO redditors(user_name, user_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE request_count = request_count + 1',
                [userName, userId])
            console.debug('Putting redditor: ', result)
        } catch (err) {
            throw err
        } finally {
            if (connection) connection.end()
        }
    }

    async putMessageBatch(batch) {
        let connection
        try {
            connection = await this.pool.getConnection()
            connection.batch('INSERT INTO messages(message_id, channel_id, guild_id, submission_id) VALUES (?, ?, ?, ?)',
                batch,
                (err, res, meta) => {
                    if(err)
                        console.error('Error loading data, reverting changes: ', err)
                    else {
                        console.debug(res)
                        console.debug(meta)
                    }
                })
        } catch (err) {
            console.error("SQL error in establishing a connection: ", err)
        } finally {
            if (connection) await connection.end(err => {
                if (err)
                    console.error("SQL error in closing connection: ", err)
            })
        }
    }

    async isAlreadySubmitted(submissionId) {

        let connection
        try {
            connection = await this.pool.getConnection()
            const cursor = await connection.query('SELECT (submission_id) FROM submissions WHERE submission_id = ?', submissionId)
            for (let entry of cursor){
                if (entry.submission_id === submissionId)
                    return true
            }
        } catch (err) {
            throw err
        } finally {
            if (connection) connection.end()
        }

        return false
    }

    async getSubmissionId(messageId, channelId) {
        let connection
        try {
            connection = await this.pool.getConnection()
            const cursor = await connection.query('SELECT (submission_id) FROM messages WHERE message_id = ? and channel_id = ?',
                [messageId, channelId])
            if (cursor.length === 0)
                return null
            return cursor[0].submission_id
        } catch (err) {
            throw err
        } finally {
            if (connection) connection.end()
        }
    }

    async getMessage(discord, submissionId) {

        let connection
        try {
            // TODO
        } catch (err) {
            throw err
        } finally {
            if (connection) connection.end()
        }
    }

    async isMessageInDatabase(messageId){

        let connection
        try {
            connection = await this.pool.getConnection()
            const cursor = await connection.query('SELECT (message_id) FROM messages WHERE message_id = ?', messageId)
            for (let entry of cursor){
                if (entry.message_id === messageId)
                    return true
            }
        } catch (err) {
            throw err
        } finally {
            if (connection) connection.end()
        }

        return false
    }

    async deleteMessage(messageId) {
        let connection
        try {
            connection = await this.pool.getConnection()
            const result = await connection.query(
                'DELETE FROM messages WHERE message_id = ?',
                [messageId])
            console.debug('Deleting message: ', result)
        } catch (err) {
            throw err
        } finally {
            if (connection) connection.end()
        }
    }

    async getChannelIds(submissionId) {
        let connection
        try {
            connection = await this.pool.getConnection()
            const cursor = await connection.query(
                'SELECT message_id, channel_id FROM messages WHERE submission_id = ?',
                submissionId)
            const channels = []
            cursor.forEach(item => {
                channels.push({
                    messageId: String(item.message_id),
                    channelId: String(item.channel_id)
                })
            })
            return channels
        } catch (err) {
            throw err
        } finally {
            if (connection) connection.end()
        }
    }

    async getSubredditName(submissionId) {
        let connection
        try {
            connection = await this.pool.getConnection()
            const cursor = await connection.query(
                'SELECT subreddit FROM submissions WHERE submission_id = ?',
                submissionId)
            return cursor[0].subreddit
        } catch (err) {
            throw err
        } finally {
            if (connection) connection.end()
        }
    }

    async putPinnedMessage(messageId, threadId, guildId, userId, submissionId) {
        let connection
        try {
            connection = await this.pool.getConnection()
            const result = await connection.query(
                'INSERT INTO pinned_submissions(message_id, thread_id, guild_id, user_id, submission_id) VALUES (?, ?, ?, ?, ?)  ON DUPLICATE KEY UPDATE update_count = update_count + 1',
                [messageId, threadId, guildId, userId, submissionId])
            console.debug('Putting message: ', result)
        } catch (err) {
            throw err
        } finally {
            if (connection) connection.end()
        }
    }

    async countPinnedMessage(userId) {
        let connection
        try {
            connection = await this.pool.getConnection()
            const result = await connection.query(
                'SELECT COUNT(user_id) AS submission_count FROM pinned_submissions WHERE user_id = ?',
                [userId])
            console.debug('Counting pinned submissions by user: ', result[0]['submission_count'])
            return result[0]['submission_count']
        } catch (err) {
            throw err
        } finally {
            if (connection) connection.end()
        }
    }

    async getUpdatePinnedSubmissions() {
        let connection
        try {
            connection = await this.pool.getConnection()
            const results = await connection.query('SELECT message_id, thread_id, guild_id, user_id, submission_id, update_count, created_at FROM pinned_submissions')

            const submissions = []
            for(const entry of results) {
                submissions.push({
                    messageId: entry['message_id'],
                    threadId: entry['thread_id'],
                    guildId: entry['guild_id'],
                    userId: entry['user_id'],
                    submissionId: entry['submission_id'],
                    updateCount: entry['update_count'],
                    createdAt: entry['created_at']
                })
            }
            console.log(`Found ${results.length} submissions to update`)
            return submissions
        } catch (err) {
            throw err
        } finally {
            if (connection) connection.end()
        }
    }

    async deletePinnedSubmission(threadId) {
        let connection
        try {
            connection = await this.pool.getConnection()
            const results = await connection.query(
                'DELETE FROM pinned_submissions WHERE thread_id = ?',
                threadId
            )
            console.log(`Deleted archived thread: `, results)
        } catch (err) {
            throw err
        } finally {
            if (connection) connection.end()
        }
    }

    async getMessageIds(submissionId) {

        let connection
        try {
            // TODO
        } catch (err) {
            throw err
        } finally {
            if (connection) connection.end()
        }
    }

    async updateMessage(submissionId, timestamp) {
        let connection
        try {
            // TODO
        } catch (err) {
            throw err
        } finally {
            if (connection) connection.end()
        }
    }

    async updatePost(submissionId, timestamp, status) {
        let connection
        try {
            // TODO
        } catch (err) {
            throw err
        } finally {
            if (connection) connection.end()
        }
    }

}

class DatabaseOracleDb extends Database {
    constructor(config) {
        super(config);
        let libPath;
        if (process.platform === 'win32')
            libPath = this.config.database.libPath
        else if (process.platform === 'drawin')
            libPath = process.env.HOME + this.config.database.libPath

        if (libPath && fs.existsSync(libPath))
            oracledb.initOracleClient({libDir: libPath})
    }

    async printTables() {
        let connection
        try {
            console.log('Establishing database connection')
            connection = await oracledb.getConnection(dbConfig)
            console.log('Established')
            const rows = await connection.query('Show Tables')
            console.log(`Tables: ${rows.length}`)
            for (let entry of rows){
                console.log(`>  ${entry[`Tables_in_${this.config.database.database}`]}`)
            }
            console.log(`Database version: ${connection.serverVersion()}`)
        } catch (err) {
            console.error(err)
            throw err
        } finally {
            if (connection) await connection.end()
        }
    }

    async setupDatabase(){
        let connection
        try{
            // Get connection
            connection = await this.pool.getConnection()

            // Create submissions table
            const submissionsResult = await connection.query(`CREATE TABLE IF NOT EXISTS submissions(
                                            id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
                                            submission_id VARCHAR(10) UNIQUE,
                                            subreddit TINYTEXT,
                                            status TINYTEXT,
                                            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                                            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)`
            )
            console.debug('Creating table pinned_submission: ', submissionsResult)

            // Create messages table
            const messagesResult = await connection.query(`CREATE TABLE IF NOT EXISTS messages(
                                            id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
                                            message_id VARCHAR(25) UNIQUE,
                                            channel_id TINYTEXT,
                                            guild_id TINYTEXT,
                                            submission_id TINYTEXT,
                                            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                                            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)`
            )
            console.debug('Creating table pinned_submission: ', messagesResult)

            // Create redditor table
            const redditorsResult = await connection.query(`CREATE TABLE IF NOT EXISTS redditors(
                                            id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
                                            user_name VARCHAR(20) UNIQUE,
                                            user_id VARCHAR(20) UNIQUE,
                                            request_count INTEGER DEFAULT 0,
                                            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                                            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)`
            )
            console.debug('Creating table pinned_submission: ', redditorsResult)

            // Create pinned messages table
            const pinnedSubmissionResult = await connection.query(`CREATE TABLE IF NOT EXISTS pinned_submissions(
                                            id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
                                            message_id VARCHAR(25) UNIQUE,
                                            thread_id TINYTEXT,
                                            guild_id TINYTEXT,
                                            user_id TINYTEXT,
                                            submission_id TINYTEXT,
                                            update_count INTEGER DEFAULT 1,
                                            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                                            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)`
            )
            console.debug('Creating table pinned_submission: ', pinnedSubmissionResult)

        }catch (err){
            throw err
        } finally {
            if (connection) await connection.end()
        }
    }

    async putSubmission(submissionId, subredditName, status) {
        let connection
        try {
            connection = await this.pool.getConnection()
            const result = await connection.query(`INSERT INTO submissions(submission_id, subreddit, status) VALUES (?, ?, ?)`,
                [submissionId, subredditName, status])
            console.debug('Putting submission: ', result)
        } catch (err) {
            throw err
        } finally {
            if (connection) await connection.end()
        }
    }

    async putRedditor(userName, userId) {

        let connection
        try {
            connection = await this.pool.getConnection()
            const result = await connection.query(
                'INSERT INTO redditors(user_name, user_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE request_count = request_count + 1',
                [userName, userId])
            console.debug('Putting redditor: ', result)
        } catch (err) {
            throw err
        } finally {
            if (connection) connection.end()
        }
    }

    async putMessageBatch(batch) {
        let connection
        try {
            connection = await this.pool.getConnection()
            connection.batch('INSERT INTO messages(message_id, channel_id, guild_id, submission_id) VALUES (?, ?, ?, ?)',
                batch,
                (err, res, meta) => {
                    if(err)
                        console.error('Error loading data, reverting changes: ', err)
                    else {
                        console.debug(res)
                        console.debug(meta)
                    }
                })
        } catch (err) {
            console.error("SQL error in establishing a connection: ", err)
        } finally {
            if (connection) await connection.end(err => {
                if (err)
                    console.error("SQL error in closing connection: ", err)
            })
        }
    }

    async isAlreadySubmitted(submissionId) {

        let connection
        try {
            connection = await this.pool.getConnection()
            const cursor = await connection.query('SELECT (submission_id) FROM submissions WHERE submission_id = ?', submissionId)
            for (let entry of cursor){
                if (entry.submission_id === submissionId)
                    return true
            }
        } catch (err) {
            throw err
        } finally {
            if (connection) connection.end()
        }

        return false
    }

    async getSubmissionId(messageId, channelId) {
        let connection
        try {
            connection = await this.pool.getConnection()
            const cursor = await connection.query('SELECT (submission_id) FROM messages WHERE message_id = ? and channel_id = ?',
                [messageId, channelId])
            if (cursor.length === 0)
                return null
            return cursor[0].submission_id
        } catch (err) {
            throw err
        } finally {
            if (connection) connection.end()
        }
    }

    async getMessage(discord, submissionId) {

        let connection
        try {
            // TODO
        } catch (err) {
            throw err
        } finally {
            if (connection) connection.end()
        }
    }

    async isMessageInDatabase(messageId){

        let connection
        try {
            connection = await this.pool.getConnection()
            const cursor = await connection.query('SELECT (message_id) FROM messages WHERE message_id = ?', messageId)
            for (let entry of cursor){
                if (entry.message_id === messageId)
                    return true
            }
        } catch (err) {
            throw err
        } finally {
            if (connection) connection.end()
        }

        return false
    }

    async deleteMessage(messageId) {
        let connection
        try {
            connection = await this.pool.getConnection()
            const result = await connection.query(
                'DELETE FROM messages WHERE message_id = ?',
                [messageId])
            console.debug('Deleting message: ', result)
        } catch (err) {
            throw err
        } finally {
            if (connection) connection.end()
        }
    }

    async getChannelIds(submissionId) {
        let connection
        try {
            connection = await this.pool.getConnection()
            const cursor = await connection.query(
                'SELECT message_id, channel_id FROM messages WHERE submission_id = ?',
                submissionId)
            const channels = []
            cursor.forEach(item => {
                channels.push({
                    messageId: String(item.message_id),
                    channelId: String(item.channel_id)
                })
            })
            return channels
        } catch (err) {
            throw err
        } finally {
            if (connection) connection.end()
        }
    }

    async getSubredditName(submissionId) {
        let connection
        try {
            connection = await this.pool.getConnection()
            const cursor = await connection.query(
                'SELECT subreddit FROM submissions WHERE submission_id = ?',
                submissionId)
            return cursor[0].subreddit
        } catch (err) {
            throw err
        } finally {
            if (connection) connection.end()
        }
    }

    async putPinnedMessage(messageId, threadId, guildId, userId, submissionId) {
        let connection
        try {
            connection = await this.pool.getConnection()
            const result = await connection.query(
                'INSERT INTO pinned_submissions(message_id, thread_id, guild_id, user_id, submission_id) VALUES (?, ?, ?, ?, ?)  ON DUPLICATE KEY UPDATE update_count = update_count + 1',
                [messageId, threadId, guildId, userId, submissionId])
            console.debug('Putting message: ', result)
        } catch (err) {
            throw err
        } finally {
            if (connection) connection.end()
        }
    }

    async countPinnedMessage(userId) {
        let connection
        try {
            connection = await this.pool.getConnection()
            const result = await connection.query(
                'SELECT COUNT(user_id) AS submission_count FROM pinned_submissions WHERE user_id = ?',
                [userId])
            console.debug('Counting pinned submissions by user: ', result[0]['submission_count'])
            return result[0]['submission_count']
        } catch (err) {
            throw err
        } finally {
            if (connection) connection.end()
        }
    }

    async getUpdatePinnedSubmissions() {
        let connection
        try {
            connection = await this.pool.getConnection()
            const results = await connection.query('SELECT message_id, thread_id, guild_id, user_id, submission_id, update_count, created_at FROM pinned_submissions')

            const submissions = []
            for(const entry of results) {
                submissions.push({
                    messageId: entry['message_id'],
                    threadId: entry['thread_id'],
                    guildId: entry['guild_id'],
                    userId: entry['user_id'],
                    submissionId: entry['submission_id'],
                    updateCount: entry['update_count'],
                    createdAt: entry['created_at']
                })
            }
            console.log(`Found ${results.length} submissions to update`)
            return submissions
        } catch (err) {
            throw err
        } finally {
            if (connection) connection.end()
        }
    }

    async deletePinnedSubmission(threadId) {
        let connection
        try {
            connection = await this.pool.getConnection()
            const results = await connection.query(
                'DELETE FROM pinned_submissions WHERE thread_id = ?',
                threadId
            )
            console.log(`Deleted archived thread: `, results)
        } catch (err) {
            throw err
        } finally {
            if (connection) connection.end()
        }
    }

    async getMessageIds(submissionId) {

        let connection
        try {
            // TODO
        } catch (err) {
            throw err
        } finally {
            if (connection) connection.end()
        }
    }

    async updateMessage(submissionId, timestamp) {
        let connection
        try {
            // TODO
        } catch (err) {
            throw err
        } finally {
            if (connection) connection.end()
        }
    }

    async updatePost(submissionId, timestamp, status) {
        let connection
        try {
            // TODO
        } catch (err) {
            throw err
        } finally {
            if (connection) connection.end()
        }
    }

}

class DiscordBot {

    constructor(config, database, cronitor) {

        this.config = config
        this.database = database
        this.cronitor = cronitor

        this.setupReddit()
        this.setupDiscord()

        // Exempt users from any pin/rate limit: AstralJaeger#0252, Kyle-K#4292, Silverstorm#5263
        this.exemptUsers = ['299862332530753537', '449235216897277982', '280817559547150356']
        this.pinLimit = 3
        this.pinUpdateLimit = 15

        process.on('SIGINT', this.onExit)
    }

    setupDiscord() {
        this.client = new Client({intents: [Intents.FLAGS.GUILDS]})

        // When client is ready
        this.client.once('ready', () => {
            console.log('Ready!')
            for(const job of this.cronjobs) {
                job.start()
            }
        })

        this.setupDiscordCommands()
        this.setupDiscordTasks()

        // Build event loop
        this.client.on('interactionCreate', this.discordEventLoop)
    }

    setupDiscordCommands() {
        // Load command files and add to client
        this.client.commands = new Collection()
        fs.readdirSync('./commands')
            .filter(file => file.endsWith('.js'))
            .map(file => require(`./commands/${file}`))
            .forEach(command => this.client.commands.set(command.data.name, command))
    }

    setupDiscordTasks() {

        // Setup task schedule
        this.findPostsJobSchedule = this.config.developmentMode ? '*/1 * * * *' : '* */10 * * * *' // Every 5th minute
        this.updatePostsJobSchedule = this.config.developmentMode ? '*/1 * * * *' : '* */6 * * *' // Every 6th hour
        this.updateSlashCommandsSchedule = '* */12 * * *' // At every minute past every 12th hour

        // Setup job monitoring
        this.findPostsMonitor = new this.cronitor.Monitor('finding-posts')
        this.updatePostsMonitor = new this.cronitor.Monitor('updating-posts')
        this.updateSlashcommandsMonitor = new this.cronitor.Monitor('updating-slash-commands')
        this.monitors = [this.findPostsMonitor, this.updatePostsMonitor, this.updateSlashcommandsMonitor]

        // Setup cron jobs
        this.findPostsJob = new CronJob(this.findPostsJobSchedule, this.findSubmissionsTask, null, false, 'Europe/Rome', this)
        this.findPostsJob.name = 'findPostsJob'
        this.updatePostsJob = new CronJob(this.updatePostsJobSchedule, this.updatePinnedSubmissionsTask, null, false, 'Europe/Rome', this)
        this.updatePostsJob.name = 'updatePostsJob'
        this.updateSlashcommandsJob = new CronJob(this.updateSlashCommandsSchedule, this.updateSlashCommandsTask, null, false, 'Europe/Rome', this)
        this.updateSlashcommandsJob.name = 'updateSlashCommandsJob'
        this.cronjobs = [this.findPostsJob, this.updatePostsJob, this.updateSlashcommandsJob]
        this.printTimeUntilNextExecution()
    }

    printTimeUntilNextExecution() {
        for (const job of this.cronjobs) {
            const nextExecution = moment(job.nextDate())
            console.log(`Time until next execution of ${job.name}: ${Math.round(nextExecution.diff(moment.now(), 'minutes', true))} min`)
        }
    }

    /**
     * Builds and returns a Discord Embed for
     * @param submission
     * @param submissionState
     * @param subredditName
     * @param subredditState
     * @returns {Promise<MessageEmbed>}
     */
    async createSubmissionEmbed(submission, submissionState, subredditName, subredditState) {

        const formatter = Intl.NumberFormat('en', {notion: 'compact'})
        // TODO: Check if author was banned/suspended or submission was deleted
        let authorName = '[deleted]'
        let authorState = ''
        let author

        try {
            author = await submission.author
            authorName = await author.name
            authorState = 'available'
        } catch (err) {
            console.log('Error finding: ', err)
            authorState = 'unavailable'
        }

        //region Declare submission, author and subreddit fields with default values
        // Submission related information
        let submissionCreated = date.format(new Date(submission.created_utc * 1000), 'YYYY-MM-DD HH:mm:ss')

        // Author related information
        let authorCreated = '-'
        let authorIcon = ''

        // Subreddit related information
        let subredditCreated = '-'
        let subredditIcon = ''
        let subredditSubscribers = 0
        let subredditNSFW = false
        let subredditDescription = '-'
        const subredditModerators = []
        //endregion

        //region Query author information
        if (authorState === 'available' && submission.selftext !== '[deleted]'){
            const author = await submission.author.fetch()
            const timestamp = author.created_utc
            const createdUtc = new Date(timestamp * 1000)
            authorCreated = date.format(createdUtc, 'YYYY-MM-DD')
            authorIcon = author.icon_img
            if (authorIcon === null || authorIcon === '')
                authorIcon = 'https://www.redditstatic.com/desktop2x/img/snoomoji/snoo_thoughtful.png'
        } else {
            authorCreated = '-'
            authorIcon = 'https://www.redditstatic.com/desktop2x/img/snoomoji/snoo_thoughtful.png'
        }
        //endregion

        //region Query subreddit information
        if (subredditState === 'public' || subredditState === 'restricted'){
            const subreddit = await this.reddit.getSubreddit(subredditName).fetch()
            subredditCreated = date.format(new Date((subreddit.created_utc) * 1000), 'YYYY-MM-DD')
            subredditNSFW = subreddit.over18
            subredditSubscribers = subreddit.subscribers
            const moderatorListing = await subreddit.getModerators()
            for (const moderator of moderatorListing) {
                subredditModerators.push(moderator.name)
            }
            subredditDescription = (subreddit.public_description)
            subredditDescription = subredditDescription === '' ?
                (subreddit.description === null ? '-' : subreddit.description.split('\n', 2)[0]) : subredditDescription
            subredditIcon = subreddit.icon_img
        }
        //endregion

        // Embed Color
        // const submissionState = await this.getSubmissionStatus(submission)
        let embedColor = this.getEmbedColor(submissionState)

        // Build embed
        return new MessageEmbed()
            .setColor(embedColor)
            .setTitle(`r/${subredditName}`)
            .setURL(`https://reddit.com/r/redditrequest/comments/${await submission.id}/`)
            .setAuthor(`u/${authorName}`, authorIcon, `https://reddit.com/u/${authorName}`)
            .setDescription(`**Title:**\n> ${await submission.title}\n\n**Description:**\n> ${subredditDescription.replaceAll('\n', '\n> ')}\n\u200B`)
            .setThumbnail(subredditIcon)
            .addField('Subreddit', this.formatSubredditState(subredditState), true)
            .addField('Submission', this.formatSubmissionStatus(submissionState), true)
            .addField('\u200B', '\u200B')
            .addField('NSFW', submission.nsfw || subredditNSFW ? '🔞' : ':x:', true)
            .addField('Subscribers', formatter.format(subredditSubscribers), true)
            .addField('Moderators', formatter.format(subredditModerators.length), true)
            .addField('Moderators', subredditModerators.length === 0 ? '-' : subredditModerators.map(str => `u/${str}`).join(', '))
            .addField('\u200B', '\u200B')
            .addField('Subreddit', subredditCreated, true)
            .addField('Redditor', authorCreated, true)
            .setTimestamp(submissionCreated)
            .setFooter(`Brought to you by u/AstralJaeger • V${BOT_VERSION}`, 'https://styles.redditmedia.com/t5_pmihh/styles/profileIcon_95r9jqyfdeu71.png')
    }

    getEmbedColor(submissionState) {
        submissionState = submissionState.toLowerCase()
        let embedColor = '#9b59b6'
        if (submissionState.includes('granted'))
            embedColor = '#2ecc71'
        else if (submissionState.includes('manual review'))
            embedColor = '#f1c40f'
        else if (submissionState.includes('follow up'))
            embedColor = '#c27c0e'
        else if (submissionState.includes('denied'))
            embedColor = '#e74c3c'
        else if (submissionState.includes('error'))
            embedColor = '#992d22'
        else
            embedColor = '#979c9f'
        return embedColor
    }

    async getSubredditStateWithAxios(subredditName) {
        let subredditState = ''
        try {
            const response = await axios.get(`https://www.reddit.com/r/${subredditName}/about.json`)
            if (response.data.subreddit_type == null || response.data.subreddit_type === 'public') subredditState = 'public'
            else if (response.data.subreddit_type === 'restricted') subredditState = 'restricted'
            else subredditState = 'wtf'
        } catch (error) {
            if (error.response.status === 403) {
                // Forbidden => PRIVATE
                subredditState = 'private'
            } else if (error.response.status === 404) {
                // NotFound => BANNED
                subredditState = 'banned'
            }
        }
        return subredditState
    }

    formatSubredditState(subredditState) {
        switch (subredditState) {
            case 'public':
                return ':green_circle: Public'
            case 'restricted':
                return ':orange_circle: Restricted'
            case 'banned':
                return ':red_circle: Banned'
            case 'private':
                return ':red_square: Private'
            case 'error':
            default:
                return ':interrobang: Error'
        }
    }

    async getSubmissionStatus(submission) {
        const limit = 100
        const dept = 5

        const comments = await submission.expandReplies({limit: limit, depth: dept}).comments
        for (const comment of comments) {
            const body = comment.body.toLowerCase()
            const flairText = comment.author_flair_text
            if (flairText != null && flairText !== '' && flairText.includes('admin')){
                if (body.includes('directly messaging the mod team')) {
                    return 'follow up'
                } else if (body.includes('manual review')) {
                    return 'manual review'
                } else if (body.includes('has been granted')) {
                    return 'granted'
                } else if (body.includes('cannot be transferred') ||
                    body.includes('aren\'t eligible for request') ||
                    body.includes('not to approve') ||
                    body.includes('mods are still active') ||
                    body.includes('not meet the minimum')) {
                    return 'denied'
                } else {
                    return 'error'
                }
            }
        }
        return 'not assessed'
    }

    formatSubmissionStatus(submissionState) {
        switch (submissionState) {
            case 'granted':
                return ':white_check_mark: Granted'
            case 'manual review':
                return ':pencil: Manual review'
            case 'follow up':
                return ':pencil: Follow up'
            case 'denied':
                return ':x: Denied'
            case 'not assessed':
                return ':exclamation: Not assessed'
            case 'error':
            default:
                return ':interrobang: Error'
        }
    }

    getSubredditName(url) {
        return String(url)
            .split('/')[4]
            .split('?')[0]
    }

    createButtons(submissionUrl, redditorUrl, subredditUrl, redditMetisUrl) {
        return [
            new MessageActionRow()
                .addComponents(new MessageButton()
                    .setCustomId('detailedReport')
                    .setLabel('Detailed Report')
                    .setStyle('PRIMARY')
                    .setDisabled(true)
                    .setEmoji('📜'))
                .addComponents(new MessageButton()
                    .setCustomId('updatePost')
                    .setLabel('Update Post')
                    .setStyle('SECONDARY')
                    .setEmoji('🔁'))
                .addComponents(new MessageButton()
                    .setCustomId('pinPost')
                    .setLabel('Pin Post')
                    .setStyle('SECONDARY')
                    .setEmoji('📌'))
                .addComponents(new MessageButton()
                    .setCustomId('readPost')
                    .setLabel('Read Aloud')
                    .setStyle('SECONDARY')
                    .setDisabled(true)
                    .setEmoji('📢')),
            new MessageActionRow()
                .addComponents(new MessageButton()
                    .setLabel('Submission')
                    .setStyle('LINK')
                    .setURL(submissionUrl)
                    .setEmoji('901474986198433852'))
                .addComponents(new MessageButton()
                    .setLabel('Redditor')
                    .setStyle('LINK')
                    .setURL(redditorUrl)
                    .setEmoji('901477101373370389'))
                .addComponents(new MessageButton()
                    .setLabel('Subreddit')
                    .setStyle('LINK')
                    .setURL(subredditUrl)
                    .setEmoji('901471253062385764'))
                .addComponents(new MessageButton()
                    .setLabel('RedditMetis')
                    .setStyle('LINK')
                    .setURL(redditMetisUrl)
                    .setEmoji('902076599405510656'))
        ]
    }

    async findSubmissionsTask() {
        this.findPostsMonitor.ping({
            state: 'run',
            env: this.config.developmentMode ? 'development' : 'production'
        })

        // TODO: Remove this line after debugging
        // this.findPostsJob.stop()

        const date = moment(Date.now())
        console.group(`Finding new posts ${date.format('YYYY/MM/DD HH:mm:ss')}`)

        // Gathering channels
        const channels = this.client.channels
            .cache
            .filter(channel => channel.name.includes(config.settings.channelName))
            .filter(channel => channel.isText())

        let submissions = await this.subreddit.getNew({limit: 25})
        for (const submission of submissions) {

            // Check reddit rate limit since snoowrap does not ratelimit
            if (this.reddit.ratelimitRemaining < 300)
                await setTimeout(()=> console.debug('Waiting for half a second'), 500)

            // Check if post already in database
            if(await this.database.isAlreadySubmitted(submission.id))
                continue

            //region Get subreddit and author details
            const subredditName = this.getSubredditName(submission.url)
            const submissionState = await this.getSubmissionStatus(submission)

            // Get subreddit state
            let subredditState = await this.getSubredditStateWithAxios(subredditName)

            // Get subreddit and author information
            const submissionId = submission.id
            const author = await submission.author.fetch()
            const authorName = author.name
            const authorId = author.id
            //endregion

            console.log(`Looking at submission ${submissionId}: ${subredditName}`)

            const embeds = [ await this.createSubmissionEmbed(submission, submissionState, subredditName, subredditState) ]
            const components = this.createButtons(
                `https://www.reddit.com/r/redditrequest/comments/${submission.id}/`,
                `https://www.reddit.com/u/${authorName}/`,
                `https://www.reddit.com/r/${subredditName}/`,
                `https://redditmetis.com/user/${authorName}`)

            // put submission and author into database
            await this.database.putSubmission(submissionId, subredditName, subredditState)
            await this.database.putRedditor(authorName, authorId)
            // submissionsBatch.push([submissionId, subredditName, subredditState])
            // redditorBatch.push([authorName, authorId])

            Promise.allSettled(channels.map(c => c.send({embeds: embeds, components: components})))
                .then(promises =>
                    this.database.putMessageBatch(promises.filter(p => p.status === 'fulfilled')
                        .map(p => p.value)
                        .map(m => [m.id, m.channelId, m.guildId, submissionId])
                    )
                )
        }

        console.groupEnd()
        this.printTimeUntilNextExecution()
        this.findPostsMonitor.ping({
            state: 'complete',
            env: this.config.developmentMode ? 'development' : 'production'
        })
    }

    async updatePinnedSubmissionsTask() {
        console.group('Updating posts')
        this.updatePostsMonitor.ping({
            state: 'run', env: this.config.developmentMode ? 'development' : 'production'
        })

        const pinnedSubmissions = await this.database.getUpdatePinnedSubmissions();

        for(const pinSub of pinnedSubmissions) {
            const thread = await this.client.channels.fetch(pinSub.threadId)

            // TODO: Generate new embed for thread w/o buttons
            const submission = await this.reddit.getSubmission(pinSub.submissionId).fetch()
            const subredditName = this.getSubredditName(submission.url)
            const subredditState = await this.getSubredditStateWithAxios(subredditName)
            const submissionState = await this.getSubmissionStatus(submission)
            const embeds = [ await this.createSubmissionEmbed(submission, submissionState, subredditName, subredditState) ]
            thread.send({
                content: `**Update for request r/${subredditName}**\n ${moment().format('MMMM Do YYYY, HH:mm:ss')}`,
                embeds: embeds
            })

            const threadAge = moment().diff(moment(pinSub.createdAt), 'days')
            console.log(`Thread ${thread.name} is now ${threadAge.toPrecision(2)} days old`)
            // Archive thread and purge from database
            if (threadAge > this.pinUpdateLimit) {
                thread.send(`This thread has reached a age of *${this.pinUpdateLimit} days*, it will now be archived`)
                    .then(msg => {
                        thread.setLocked(true)
                        thread.setArchived(true)
                        this.database.deletePinnedSubmission(thread.id)
                    })
            }
        }

        // TODO: remove archived threads from table.

        console.groupEnd()
        this.updatePostsMonitor.ping({
            state: 'complete',
            env: this.config.developmentMode ? 'development' : 'production'
        })
    }

    async updateSlashCommandsTask(){
        this.updateSlashcommandsMonitor.ping({
            state: 'run',
            env: this.config.developmentMode ? 'development' : 'production'
        })

        const commands = [];
        const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));

        for (const file of commandFiles) {
            const command = require(`./commands/${file}`);
            commands.push(command.data.toJSON());
        }

        const rest = new REST({ version: '9' }).setToken(config.discord.token);

        console.log('Updating application (/) commands: ', commands.map(cmd => cmd.name))

        rest.put(
            Routes.applicationCommands(config.discord.clientId),
            { body: commands },
        )
        .then(() => {
            console.log('Successfully reloaded application (/) commands.' )
            this.updatePostsMonitor.ping({
                state: 'complete',
                env: this.config.developmentMode ? 'development' : 'production'
            })
        })
        .catch(err => {
            console.error('Couldn\'t reload application (/) commands: ', err)
            this.updatePostsMonitor.ping({
                state: 'failed',
                env: this.config.developmentMode ? 'development' : 'production'
            })
        })
    }

    async discordEventLoop(itx) {

        // Reply to buttons
        if (itx.isButton()) {
            console.log(`Button ${itx.customId} pressed`)
            await bot.discordEventLoopButtons(itx)
        }

        // Reply to commands
        if (itx.isCommand()) {
            // monitor.ping({message: 'handling-command-event'})
            const command = client.commands.get(itx.commandName)
            if (!command) return

            try {
                await command.execute(itx)
            } catch (error) {
                console.error(error)
                await itx.reply({content: 'There was an error executing this command!', ephemeral: true})
            }
        }
    }

    async discordEventLoopButtons(itx) {
        await itx.deferReply({ephemeral: true})

        if (itx.customId === 'detailedReport') {
            await this.generateDetailedReport(itx)
        } else if (itx.customId === 'updatePost') {
            await this.updatePost(itx)
        } else if (itx.customId === 'pinPost') {
            await this.pinPost(itx)
        } else if (itx.customId === 'readPost') {
            await this.readPost(itx)
        }
    }

    async generateDetailedReport(itx) {
        // TODO: Update message with report
        await itx.editReply({content: 'Done. Checkout the result at the original post', ephemeral: true})
    }

    async updatePost(itx) {
        const message = itx.message
        const sourceMessageId = message.id
        const sourceChannelId = message.channelId

        const submissionId = await this.database.getSubmissionId(sourceMessageId, sourceChannelId)

        if (submissionId === null)
            return

        const submission = await this.reddit.getSubmission(submissionId)
        const subredditName = this.getSubredditName(await submission.url)
        let subredditState = await this.getSubredditStateWithAxios(subredditName)

        console.log(`Updating submission post for ${subredditName}`)

        // Get all channels where submission was submitted
        const channelEntries = await this.database.getChannelIds(submissionId)
        const submissionState = await this.getSubmissionStatus(submission)

        const embeds = [ await this.createSubmissionEmbed(submission, submissionState, subredditName, subredditState) ]

        for (const channelEntry of channelEntries) {
            const channel = await this.client.channels.fetch(channelEntry.channelId)
            try {
                const msg = await channel.messages.fetch(channelEntry.messageId)
                msg.edit({embeds: embeds})
                    .catch(err => console.log(`Couldn\'t send message in channel ${channel.name} of guild ${channel.guild.name}: `, err))
            } catch (err) {
                console.log('An error occurred updating a message in a channel, the message or channel might have been deleted')
            }
        }

        itx.editReply({content: 'Done. Checkout the result at the original post', ephemeral: true})
    }

    async pinPost(itx) {
        // Put message in 'pinned' table and create task to update them
        const message = itx.message
        const user = await itx.user.fetch()
        const sourceMessageId = message.id
        const sourceChannelId = message.channelId

        const submissionId = await this.database.getSubmissionId(sourceMessageId, sourceChannelId)

        if (submissionId === null) {
            await itx.editReply({content: 'This submission does not exist', ephemeral: true})
            return
        }

        // TODO: Check if thread already exists or was archived

        // Check how many pins the user already issued
        const pinnedCount = (await this.database.countPinnedMessage(user.id))
        if (pinnedCount >= this.pinLimit && !this.exemptUsers.includes(user.id)) {
            await itx.editReply(`<@${user.id}>, you reached your pin limit of **${pinnedCount}**/**${this.pinLimit}** 📌, \nplease wait for some to expire or close the thread!`)
            return
        }

        const subredditName = await this.database.getSubredditName(submissionId)
        message.startThread({
            name: subredditName.toLowerCase(),
            autoArchiveDuration: 1440,
            reason: `User ${itx.user.username} pinned subreddit r/${subredditName}, future updates will be posted in this thread.`
        })
        .then(thread => {
            this.database.putPinnedMessage(message.id, thread.id, message.guildId, user.id, submissionId)
            thread.members.add(user)
            thread.send(`Please use this thread to discuss about the submission.\nIt will get updated regularly and kept alive for **15 days**. \nHave fun!`)
        })
        await itx.editReply({content: 'Done.', ephemeral: true})
    }

    async readPost(itx) {
        // TODO Check if invoking user is in voice chat and pop in and read out loud
        await itx.editReply({content: 'This feature is not yet available', ephemeral: true})
    }

    async onMessageDelete(message) {
        if (!(await this.database.isMessageInDatabase(message.id)))
            return message

        this.database.deleteMessage(message.id)
        return message
    }

    setupReddit() {

        this.reddit = new snoowrap(this.config.reddit)
        this.reddit.config({debug: false})
        this.subreddit = this.reddit.getSubreddit('redditrequest')
    }

    start() {
        this.client.login(config.discord.token)
    }

    onExit() {
        console.log('About to terminate application. Cleaning up...')

        // Stop tasks
        for(const job of bot.cronjobs) {
            job.stop()
        }

        // Notify monitoring tool
        for(const monitor of bot.monitors) {
            monitor.pause(1)
        }

        // destroy discordJs client
        bot.client.destroy()

        // exit application
        process.exit(0)
    }
}

console.log('Initiating Database')

let database
if(dbType === 'maria')
    database = new DatabaseMariadb(config)
else if (dbType === 'oracle')
    database = new DatabaseOracleDb(config)

let bot = null;
database.setupDatabase()
    .then(() => database.printTables())
    .then(() => bot = new DiscordBot(config, database, cronitor))
    .then(() => bot.start())

// console.log('Initiating Bot')
// const bot = new DiscordBot(config, database, cronitor)
//
// console.log('Starting Bot')
// bot.start()
