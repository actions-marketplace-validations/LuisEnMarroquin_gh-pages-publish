import { setFailed, getInput, setOutput } from '@actions/core'
import { context } from '@actions/github'
import { execSync } from 'child_process'

try {
  const exec = (command: string, display = true) => {
    if (display) console.log('exec', command.length, command)
    const result = execSync(command, { encoding: 'utf-8', timeout: 1000 * 60 })
    if (display) console.log(result)
    return result.replace(/(?:\r\n|\r|\n)/g, '')
  }

  const branchExists = (branch: string) => exec(`git ls-remote --heads origin ${branch}`).length > 0 ? true : false

  const BRANCH = getInput('BRANCH')
  const FOLDER = getInput('FOLDER')
  const SSHKEY = getInput('SSHKEY')

  const branchName = exec('git rev-parse --abbrev-ref HEAD') // Get branch name from git
  const branchHead = exec('git show --format="%h" --no-patch') // Get branch name from git
  const cmtMessage = `Deploy to ${BRANCH} from ${branchName} @ ${branchHead} 🚀`

  let userName = 'LuisEnMarroquin', userEmail = 'mluis651@gmail.com'
  try {
    userName = context.payload.pusher ? (context.payload.pusher.name || userName) : userName
    userEmail = context.payload.pusher ? (context.payload.pusher.email || userEmail) : userEmail
  } catch (error) {
    console.error('Payload errors', { error })
    console.error('Payload string', JSON.stringify(context.payload, undefined, 2))
  }

  exec(`git config --global user.name "${userName}"`)
  exec(`git config --global user.email "${userEmail}"`)

  const sshFolder = '~/.ssh/', sshGithub = '~/.ssh/github'
  exec(`mkdir -p ${sshFolder} && chmod 755 ${sshFolder}`)
  exec(`echo "${SSHKEY}" > ${sshGithub} && chmod 600 ${sshGithub}`, false)
  exec(`echo "Host github.com\n  HostName github.com\n  IdentityFile ${sshGithub}\n  StrictHostKeyChecking no\n" > ~/.ssh/config`)

  const oldOrigin = exec('git remote get-url origin') // Get https origin
  const newOrigin = oldOrigin.replace('https://github.com/', 'git@github.com:') + '.git' // Create ssh origin from https origin
  exec(`git remote set-url origin ${newOrigin}`) // Set new ssh origin

  const runDif = `${BRANCH}-${branchHead}-${Math.ceil(Math.random() * 9876543210)}`
  const pagesDirectory = `~/publishFolder-${runDif}`
  exec(`mkdir -p ${pagesDirectory}`) // Create publish folder
  exec(`cp -R ${FOLDER}/ ${pagesDirectory}/`) // Copy build folder
  exec('git stash') // Remove any change to the folder to allow branch changing
  if (!branchExists(BRANCH)) { // Creating new branch
    exec(`git checkout --orphan ${BRANCH}`) // Create branch if doesn't exist
  } else { // Branch already exists
    exec(`git fetch origin ${BRANCH}`) // Pull branch from remote
    exec(`git checkout ${BRANCH}`) // Change to existing branch
    exec('git pull') // Pull changes from remote
  }
  exec(`cp -R .git/ ${pagesDirectory}/`) // Copy .git folder
  exec(`ls -aR ${pagesDirectory}`) // List files in folder to publish
  exec(`cd ${pagesDirectory} && git config user.name ${userName}`)
  exec(`cd ${pagesDirectory} && git config user.email ${userEmail}`)
  exec(`cd ${pagesDirectory} && git rm -r --cached . -f`)
  exec(`cd ${pagesDirectory} && git status`)
  exec(`cd ${pagesDirectory} && git add . --verbose`)
  exec(`cd ${pagesDirectory} && git commit --allow-empty -m "${cmtMessage}" --verbose`)
  exec(`cd ${pagesDirectory} && git push -f --set-upstream origin ${BRANCH}`)
  exec(`rm -rf ${pagesDirectory}`)

  setOutput('TIMING', (new Date()).toTimeString())
} catch (error) {
  setFailed(error.message)
}
