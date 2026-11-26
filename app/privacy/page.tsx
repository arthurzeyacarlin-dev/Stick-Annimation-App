import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, SupportEmail, type LegalSection } from "@/src/components/legal/LegalPage";

// The app's Privacy Policy (Nov 23). Same words as the website's page, for the app: the companies that help are named by
// what they do ("our email service", "our payment provider"). Works signed out.
export const metadata: Metadata = { title: "Privacy Policy · Diamond Animator", description: "What Diamond Animator collects, why, who helps us, and your choices." };

const sections: LegalSection[] = [
  {
    id: "summary",
    title: "The short version",
    content: (
      <ul>
        <li>We collect what we need to run Diamond Animator: your account, your projects, your AI messages, and your billing status.</li>
        <li><strong>We don&rsquo;t sell your personal information.</strong> We don&rsquo;t use your content to train AI models.</li>
        <li>A few trusted companies help us run the service (hosting, database, AI, email, payments). What each one does is listed below.</li>
        <li>When you create an account, your email address goes to our email service so we can send you emails about your free trial and tips. Every one of those emails has an unsubscribe link.</li>
        <li>Children under 13 use Diamond Animator through a parent or guardian&rsquo;s account, made with the parent&rsquo;s own email. We never send marketing emails to children and never feature them.</li>
        <li>You can ask to see, fix, download or delete your data at any time: <SupportEmail />.</li>
      </ul>
    ),
  },
  {
    id: "who-we-are",
    title: "Who we are",
    content: <p>Diamond Animator is based in the United States. We are responsible for your personal information as described in this policy. This policy covers the Diamond Animator app and our emails.</p>,
  },
  {
    id: "what-we-collect",
    title: "What we collect",
    content: (
      <>
        <h3>Information you give us</h3>
        <ul>
          <li><strong>Account details:</strong> your name, email address, sign-in details, profile picture if you add one, and your plan.</li>
          <li><strong>Your age group:</strong> when you sign up we ask your birth year, only to know whether you are 13 or older. We keep only the answer (&ldquo;13 or older&rdquo; or &ldquo;a parent&rsquo;s account&rdquo;), never the birth year itself.</li>
          <li><strong>Your content:</strong> drawings, timelines, projects and the videos you export.</li>
          <li><strong>AI messages:</strong> what you type to the AI Animator and Help Assistant, and the replies.</li>
          <li><strong>Messages to us:</strong> support emails, feedback and problem reports.</li>
        </ul>
        <h3>Information created when you use the app</h3>
        <ul>
          <li><strong>Usage records:</strong> how many AI credits you have used, and when.</li>
          <li><strong>Billing status:</strong> your plan, subscription dates and payment status from our payment provider. We don&rsquo;t receive or store your full card number.</li>
          <li><strong>Technical data:</strong> device and browser type, IP address, error logs, and similar data our hosting providers record to keep the service working and secure.</li>
        </ul>
        <p>We don&rsquo;t ask for sensitive information (like health or government ID numbers) and ask you not to put it in your projects or prompts.</p>
      </>
    ),
  },
  {
    id: "how-we-use",
    title: "How we use it",
    content: (
      <ul>
        <li>To create and run your account, save your projects and export your videos.</li>
        <li>To send your prompts to our AI providers and show you the answer.</li>
        <li>To count AI credits and manage your trial and subscription.</li>
        <li>To send you service emails (password reset, receipts, important changes).</li>
        <li>To send you trial and tips emails, as described in the next section.</li>
        <li>To keep the service safe, stop abuse and enforce our <Link href="/terms">Terms of Service</Link>.</li>
        <li>To fix bugs and improve the app.</li>
        <li>To follow the law.</li>
      </ul>
    ),
  },
  {
    id: "emails",
    title: "Emails we send you",
    content: (
      <>
        <p>
          When you create an account, <strong>your email address is sent to our email service</strong>, together with three simple facts when they
          happen: your free trial started, you picked a plan, or you deleted your account. We use this to email you about your free trial
          (for example, that it started and when it is about to end) and to send you tips for making animations.
        </p>
        <p>
          <strong>Every one of these emails has an unsubscribe link.</strong> One click and they stop. You can also email <SupportEmail /> and
          we will stop them for you. Deleting your account stops them too.
        </p>
        <p>Emails you need to use your account, like a password reset link, are only sent when you ask for them.</p>
      </>
    ),
  },
  {
    id: "ai",
    title: "AI and your content",
    content: (
      <>
        <p>
          When you use the AI Animator or Help Assistant, your message and the project information needed to answer it are sent to our AI
          providers, which process it to produce the reply or the animation. <strong>We do not use your content to train AI models.</strong>{" "}
          Our AI providers handle this data under their own terms and policies for business customers.
        </p>
        <p>We may review AI messages when needed to investigate abuse, fix a problem you report, or follow the law.</p>
      </>
    ),
  },
  {
    id: "service-providers",
    title: "Companies that help us",
    content: (
      <>
        <p>We share personal information only with service providers that help us run Diamond Animator, and only for that purpose. Each one has its own terms and privacy policy.</p>
        <ul>
          <li><strong>Our hosting and database providers</strong> run the app and store account details, projects, AI message history and usage records.</li>
          <li><strong>Our AI providers</strong> power the AI Animator and Help Assistant. They handle your prompts and the project details needed to answer them.</li>
          <li><strong>Our payment provider</strong> handles payments and subscriptions: payment details, billing address and subscription status. Your card details go straight to them, not to us.</li>
          <li><strong>Our email service</strong> sends the trial and tips emails. It handles your email address, the three facts above, and whether you open or click our emails.</li>
          <li><strong>Our account email sender</strong> sends emails like password reset links. It handles your email address and the email content.</li>
        </ul>
        <p>To ask which companies these are, email <SupportEmail />.</p>
        <p>We may also share information if the law requires it, to protect people&rsquo;s safety, or as part of a sale or merger of the business (in which case this policy keeps applying or we will tell you).</p>
        <p><strong>We do not sell your personal information</strong> and we do not &ldquo;share&rdquo; children&rsquo;s information for targeted advertising. The app has no advertising tags.</p>
      </>
    ),
  },
  {
    id: "legal-bases",
    title: "Why we’re allowed to use it",
    content: (
      <p>
        Where the law asks for a reason (for example in the EU or UK), we use your information because we need it to provide the service you
        signed up for (contract), because you agreed (consent, for example parental consent for children), because we have a legitimate
        interest in keeping the service secure, improving it and telling you how to get the most from your trial, or because the law requires it.
      </p>
    ),
  },
  {
    id: "retention",
    title: "How long we keep it",
    content: (
      <ul>
        <li>Account and project data: while your account is open, and then deleted within a reasonable time after you ask us to delete it or close your account.</li>
        <li>Data from accounts whose trial ended without a subscription: kept for a limited time so you can come back and subscribe, then deleted.</li>
        <li>Free trial check: each email inbox gets one free trial. To stop the same inbox from getting a second one, we keep a scrambled code made from the inbox (never the email address itself) once its trial has started, also after the account is deleted. It can&rsquo;t be turned back into your address.</li>
        <li>Billing records: as long as tax and accounting laws require.</li>
        <li>Backups and logs: kept for a limited time and then overwritten.</li>
        <li>Children&rsquo;s data: only as long as reasonably needed for the purpose it was collected, then deleted.</li>
      </ul>
    ),
  },
  {
    id: "your-rights",
    title: "Your choices and rights",
    content: (
      <>
        <p>You can ask us to:</p>
        <ul>
          <li>see the personal information we have about you;</li>
          <li>correct it if it&rsquo;s wrong;</li>
          <li>give you a copy of it;</li>
          <li>delete it (and your account). You can also delete your account yourself in your Profile;</li>
          <li>stop the trial and tips emails (use the unsubscribe link in any of them, or email us);</li>
          <li>withdraw consent you gave.</li>
        </ul>
        <p>
          Depending on where you live (for example California and other US states, the EU or the UK), the law may give you more rights, such
          as the right to complain to a data protection authority. We will not treat you differently for using your rights. To make a
          request, email <SupportEmail />. We may need to check it&rsquo;s really you before we act.
        </p>
      </>
    ),
  },
  {
    id: "security",
    title: "Keeping it safe",
    content: <p>We use trusted providers, encrypted connections (HTTPS), access controls, and limited staff access. No system is perfectly secure, so please use a strong, unique password. If a data breach affects you, we will tell you as the law requires.</p>,
  },
  {
    id: "international",
    title: "Where your data is stored",
    content: <p>We are based in the United States, and our providers may store or process data in the US and other countries. If you use Diamond Animator from outside the US, your information will be transferred there. Where the law requires, we rely on safeguards such as standard contractual clauses offered by our providers.</p>,
  },
  {
    id: "children",
    title: "Children",
    content: (
      <>
        <p>We follow the US Children&rsquo;s Online Privacy Protection Act (COPPA). Here is how it works:</p>
        <ul>
          <li><strong>Sign-up asks your birth year.</strong> If you are under 13, we don&rsquo;t make an account with your email. Instead we ask you to get a parent or guardian.</li>
          <li><strong>The parent makes the account</strong> with their own email address and agrees: &ldquo;I&rsquo;m the parent or guardian and I agree for my child to use Diamond Animator.&rdquo; The child then uses that account.</li>
          <li><strong>We keep only an age group</strong> (&ldquo;13 or older&rdquo; or &ldquo;a parent&rsquo;s account&rdquo;), never a birth year, and we don&rsquo;t ask for the child&rsquo;s name, email or other contact details.</li>
          <li><strong>Emails go to the parent.</strong> Our tips and follow-up emails go only to people who are 13 or older and to parents, never to a child.</li>
          <li><strong>Children are never featured.</strong> Only people who say they are 13 or older can have their words or photo shown on our website or in ads.</li>
          <li><strong>Accounts made before this rule</strong> are asked once whether the person is 13 or older. If they are under 13, we stop our emails to that address and ask a parent to make their own account.</li>
        </ul>
        <p>Parents can ask to review, change or delete their child&rsquo;s information, or stop its use, at any time: <SupportEmail />.</p>
      </>
    ),
  },
  {
    id: "changes",
    title: "Changes to this policy",
    content: <p>We will update this page when our practices change and change the &ldquo;Last updated&rdquo; date. If a change is important, we will tell you by email or in the app first, and if the law requires it (for example for children&rsquo;s data), we will ask for consent again.</p>,
  },
  { id: "contact", title: "Contact", content: <p>Questions or requests: <SupportEmail /></p> },
];

export default function PrivacyPage() {
  return <LegalPage title="Privacy Policy" intro="What we collect, why we collect it, who helps us, and how you stay in control." updated="November 26, 2026" sections={sections} other={{ href: "/terms", label: "Terms of Service" }} />;
}
