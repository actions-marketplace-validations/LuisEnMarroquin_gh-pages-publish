import { setFailed, getInput, setOutput } from '@actions/core'
import { context } from '@actions/github'
import { execSync } from 'child_process'

try {
  const exec = (command, display = true) => {
    if (display) console.log('exec', command.length, command)
    const result = execSync(command, { encoding: 'utf-8' })
    if (display) console.log(result)
    return result
  }

  const rmLineBreaks = (text) => {
    text = text.replace('\r\n', '') // Windows
    text = text.replace('\n', '') // Unix
    return text
  }

  const branchExists = (branch) => {
    const remoteExists = rmLineBreaks(exec(`git ls-remote --heads origin ${branch}`))
    return (remoteExists.length > 0)
  }

  const httpsToSsh = (https) => {
    let ssh = https.replace('https://github.com/', 'git@github.com:')
    ssh += '.git'
    return ssh
  }

  const BRANCH = getInput('BRANCH')
  const FOLDER = getInput('FOLDER')
  const SSHKEY = getInput('SSHKEY')

  const branchName = rmLineBreaks(exec('git rev-parse --abbrev-ref HEAD')) // Get branch name from git
  const branchHead = rmLineBreaks(exec('git show --format="%h" --no-patch')) // Get branch name from git

  const commitMessage = `Deploy to ${BRANCH} from ${branchName} @ ${branchHead} 🚀`
  const payload = context.payload
  let userName = 'LuisEnMarroquin'
  let userEmail = 'mluis651@gmail.com'
  try {
    userName = payload.pusher ? (payload.pusher.name || userName) : userName
    userEmail = payload.pusher ? (payload.pusher.email || userEmail) : userEmail
  } catch (error) {
    console.error('Payload error', { error })
    const payloadString = JSON.stringify(payload, undefined, 2) // Get the JSON webhook payload for the event that triggered the workflow
    console.log(`The event payload is: ${payloadString}`)
  }

  exec(`git config --global user.name "${userName}"`)
  exec(`git config --global user.email "${userEmail}"`)
  exec('git config --global pull.rebase true')

  const sshFolder = '~/.ssh/' // SSH folder location
  exec(`mkdir -p ${sshFolder}`) // Create SSH folder if doesn't exists
  exec(`chmod 755 ${sshFolder}`)
  const sshGithub = '~/.ssh/github' // SSH key file location
  exec(`echo "${SSHKEY}" > ${sshGithub}`, false)
  exec(`chmod 600 ${sshGithub}`)
  const sshConfig = '~/.ssh/config' // SSH config file location
  const configText = 'Host github.com\n  HostName github.com\n  IdentityFile ~/.ssh/github\n  StrictHostKeyChecking no\n'
  exec(`echo "${configText}" > ${sshConfig}`)
  exec(`wc -l ${sshGithub} ${sshConfig}`)

  const oldOrigin = rmLineBreaks(exec('git remote get-url origin')) // Get https origin
  const newOrigin = rmLineBreaks(httpsToSsh(oldOrigin)) // Create ssh origin from https origin
  exec(`git remote set-url origin ${newOrigin}`) // Set new ssh origin
  exec('git remote get-url origin') // Show new ssh origin
  exec('git config --global --list') // Show global git config
  exec('git config --list') // Show project git config

  const randomNumber = Math.floor(Math.random() * 9876543210) + 1
  const runDif = `${BRANCH}-${branchHead}-${randomNumber}`
  const pagesDirectory = `~/publishFolder-${runDif}`
  const buildCompression = `~/buildFolder-${runDif}.tar.gz`
  const gitCompression = `~/gitFolder-${runDif}.tar.gz`
  exec(`mkdir -p ${pagesDirectory}`) // Create publish folder
  exec(`tar -C ${FOLDER} -czvf ${buildCompression} ./`) // Compressing build folder
  exec(`tar xvzf ${buildCompression} -C ${pagesDirectory}/`) // Uncompress build folder
  exec('git stash') // Remove any change to the folder to allow branch changing
  if (!branchExists(BRANCH)) {
    console.log('Creating new branch')
    exec(`git checkout --orphan ${BRANCH}`) // Create branch if doesn't exist
  } else {
    console.log('Branch already existed')
    exec(`git fetch origin ${BRANCH}`) // Pull branch from remote
    exec(`git checkout ${BRANCH}`) // Change to existing branch if exists
    exec('git pull') // Pull branch from remote
  }
  exec(`tar -czvf ${gitCompression} .git/`) // Compressing .git folder
  exec(`tar xvzf ${gitCompression} -C ${pagesDirectory}/`) // Uncompress .git folder
  exec(`ls -aR ${pagesDirectory}`) // List files in folder to publish
  exec(`cd ${pagesDirectory} && git config user.name ${userName}`)
  exec(`cd ${pagesDirectory} && git config user.email ${userEmail}`)
  exec(`cd ${pagesDirectory} && git rm -r --cached . -f`)
  exec(`cd ${pagesDirectory} && git status`)
  exec(`cd ${pagesDirectory} && git add . --verbose`)
  exec(`cd ${pagesDirectory} && git commit --allow-empty -m "${commitMessage}" --verbose`)
  exec(`cd ${pagesDirectory} && git push -f --set-upstream origin ${BRANCH}`)
  exec(`rm -rf ${gitCompression} ${buildCompression} ${pagesDirectory}`)

  const time = (new Date()).toTimeString()
  setOutput('TIMING', time)
} catch (error) {
  setFailed(error.message)
}
