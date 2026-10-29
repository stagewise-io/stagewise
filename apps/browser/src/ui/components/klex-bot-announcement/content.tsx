import { IconArrowUpRightOutline18 } from '@stagewise/icons';
import klexWink from '../../../../assets/announcements/klex-wink.webp';
import klexWelcome from '../../../../assets/announcements/klex-welcome.webp';
import './announcement.css';

export const KLEX_BOT_ANNOUNCEMENT_TITLE = 'Say Hello to Klex Bots';

export function KlexBotAnnouncementContent() {
  return (
    <div className="flex flex-col gap-4 text-base text-muted-foreground leading-relaxed">
      <img
        src={klexWelcome}
        alt=""
        width={2400}
        height={900}
        className="aspect-[24/9] w-full shrink-0 rounded-3xl border border-border-subtle object-cover"
      />
      <p>
        The stagewise team is building Klex Bots: open-source digital coworkers
        that work alongside your team, not another chat to manage.
      </p>
      <p>
        Plan the next week's work with your Klex Bots on Slack or Teams.
        <br />
        Assign an issue in a project management tool like Linear or Jira to a
        Klex Bot, and it will pick it up, implement the changes on its own
        computer, and open a pull request on GitHub or GitLab for your team to
        review.
      </p>
      <p>
        With their own identities and memories, Klex Bots learn how your team
        works and collaborate in the tools you already use.
        <br />
        Just like you would expect from a true coworker.
      </p>
    </div>
  );
}

export function KlexBotAnnouncementCardContent() {
  return (
    <>
      <span className="flex items-center justify-center px-6 py-4">
        <img
          src={klexWink}
          alt=""
          width={945}
          height={512}
          className="h-auto max-h-24 w-2/3 -scale-x-100 object-contain"
        />
      </span>
      <span className="klex-announcement-title text-foreground text-lg leading-tight">
        Say Hello to <span className="whitespace-nowrap">Klex Bots</span>
      </span>
      <span className="flex items-end justify-between gap-2">
        <span className="text-muted-foreground text-xs leading-relaxed">
          Meet open-source digital coworkers that take coding tasks from issue
          to pull request.
        </span>
        <IconArrowUpRightOutline18
          aria-hidden="true"
          className="size-3 shrink-0 text-subtle-foreground"
        />
      </span>
    </>
  );
}
