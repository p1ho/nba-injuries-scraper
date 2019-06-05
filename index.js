const get = require('request-promise')
const cheerio = require('cheerio')
const fs = require('fs')
const path = require('path')

const baseUrl = "https://www.foxsports.com/nba/"
const nbaTeamDict = JSON.parse(fs.readFileSync("./nba-teams.json"))

var https = require('https')
var httpsAgent = new https.Agent()
httpsAgent.maxSockets = 3

let finalDict = {
  teams: {},
  updated: undefined,
}

let t1 = new Date()

console.info("\nFetching Player Injury Urls...")
console.log("\n===============================\n")
let teamFetchQueue = []
for (let [team, teamObj] of Object.entries(nbaTeamDict)) {
  finalDict['teams'][team] = {}
  teamFetchQueue.push(
    get({
      url: teamObj['roster-url'],
      transform: function (body) {
        return cheerio.load(body)
      },
      pool: httpsAgent
    }).then( $ => {
        const playerEl = $('.wisbb_fullPlayer')
        console.log(`Fetched Team ${teamObj.name}\n`)
        for (let i = 0; i < playerEl.length; i++) {
          let playerCode = playerEl[i].attribs.href
                              .replace('/nba/', '')
                              .replace('-player-stats', '')
          let playerName = $(playerEl[i]).children().first().text()
          console.log(`Found Player: ${playerName} (${playerCode})`)
          let injuryUrl = baseUrl + playerCode + '-player-injuries'
          finalDict['teams'][team][playerCode] = {
            name: playerName,
            url: injuryUrl
          }
        }
        console.log("\n===============================\n")
      })
      .catch( err => {
        console.error(err)
      })
  )
}

let playerFetchQueue = []
Promise.all(teamFetchQueue).then( () => {
  console.info("\nFetching Player Injuries...")
  console.log("\n===============================\n")
  for (let [team, players] of Object.entries(finalDict['teams'])) {
    for (let [player, playerObj] of Object.entries(players)) {
      playerFetchQueue.push(
        get({
          url: playerObj.url,
          transform: function (body) {
            return cheerio.load(body)
          },
          pool: httpsAgent
        }).then( $ => {
            const injuriesEl = $('tbody .wisbb_fvStand')
            console.log(`(${injuriesEl.length} injuries) ${playerObj.name} `)
            const imgSrc = $('.wisfb_headshotImage.wisfb_bioLargeImg')[0].attribs.src
            finalDict['teams'][team][player]['image'] = imgSrc
            finalDict['teams'][team][player]['injuries'] = []
            for (let i = 0; i < injuriesEl.length; i++) {
              finalDict['teams'][team][player]['injuries'].push({
                date: $(injuriesEl[i]).children()[0].children[0].data,
                injury: $(injuriesEl[i]).children()[1].children[0].data
              })
            }
          })
          .catch( err => {
            console.error(err)
          })
      )
    }
  }
}).then( () => {
  Promise.all(playerFetchQueue).then( () => {
    console.log("\n===============================\n")
    let t2 = new Date()
    finalDict['updated'] = t2
    console.info(`Fetch time: %ds`, ((t2-t1)/1000).toFixed(2))

    let outputPath = path.resolve(`${__dirname}/output`)
    let outputName = 'nba-injuries.json'
    if (!fs.existsSync(outputPath)) {
      fs.mkdirSync(outputPath)
    }

    let json = JSON.stringify(finalDict)
    try {
      fs.writeFileSync(`${outputPath}/${outputName}`, json, 'utf8')
      console.info('File save success: Generated JSON saved!')
    } catch (err) {
      console.error(`File save error: ${err}`)
    }
  })
})
