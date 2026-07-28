<!--
Copy this file to config/ruleset.md and edit it. Its presence is the on switch:
with no config/ruleset.md, comments publish unchecked. Override the path with
the MODERATION_RULESET environment variable.

The whole file is handed to the moderation model as the rules a new comment is
judged against, and is shown read-only to site owners in the admin. Write it
for a human — plain prose works better than keywords.

Two tiers drive enforcement. Rules you frame as severe and unambiguous produce
`reject` verdicts, which are always withheld from readers. Judgement calls
produce `hold` verdicts, which respect the "hold borderline comments" setting
in the admin. A "not a violation" section is worth keeping: the usual failure
mode of comment moderation is flagging too much, not too little.

Moderation also needs an AI provider configured, and fails open — if the model
errors or times out, the comment publishes.
-->

# Discussion rules

These rules apply to comments on this site.

## Never allowed

- **Threats and incitement.** Threatening violence against anyone, or urging
  others to commit it.
- **Targeted harassment.** Sustained abuse aimed at a specific person.
- **Hate.** Attacking or dehumanising people over race, ethnicity, national
  origin, religion, disability, sex, gender identity, or sexual orientation.
- **Doxxing.** Posting someone's private identifying information without
  consent.
- **Malicious links.** Phishing, malware, or links disguised as something else.

## Held for review

- **Personal attacks.** Going after the person instead of the argument.
- **Off-topic.** A comment with no discernible connection to the post it sits
  under.
- **Spam.** Repetitive posting, SEO link-dropping, or affiliate links dressed
  up as recommendations.
- **Impersonation.** Claiming to be the site owner or a real person the
  commenter plainly is not.

## Not violations

- **Disagreement.** Disagreeing with the post or the author — strongly or
  repeatedly — is fine.
- **Criticism.** Harsh critique of the work, as long as it addresses the work
  rather than the person.
- **Strong language.** Swearing and sarcasm are style, not violations, unless
  aimed at a person as abuse.
- **Being wrong.** Factual errors are for other commenters to answer.

## When uncertain

Allow it. Holding a good comment costs a conversation; letting a borderline one
through costs one click.
