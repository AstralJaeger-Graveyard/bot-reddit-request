'use strict';

const fs = require('fs')

const { SlashCommandBuilder } = require('@discordjs/builders');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');
const config = require('./config-production.json');

const commands = fs.readdirSync(`./commands`)
    .filter(file => file.endsWith('.js'))
    .map(file => require(`./commands/${file}`))
    .map(command => command.data.toJSON())

const rest = new REST({ version: '9' }).setToken(config.discord.token);

rest.put(Routes.applicationCommands(config.discord.clientId),
    { body: commands })
    .then(() => console.log('Successfully registered application commands.'))
    .catch(console.error);
