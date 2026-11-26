import type { Metadata } from "next";
import Link from "next/link";
import { ACCOUNT_PLANS, TRIAL_DAYS } from "@/src/lib/account/plans";
import { LegalPage, SupportEmail, type LegalSection } from "@/src/components/legal/LegalPage";

// The app's Terms of Service (Nov 23). Same words as the website's page, for the app. Works signed out.
export const metadata: Metadata = { title: "Terms of Service · Diamond Animator", description: "The rules for using Diamond Animator." };

const sections: LegalSection[] = [
  {
    id: "who-we-are",
    title: "Who we are and what these Terms cover",
    content: (
      <>
        <p>
          These Terms of Service (the &ldquo;Terms&rdquo;) are an agreement between you and Diamond Animator (&ldquo;Diamond Animator&rdquo;,
          &ldquo;we&rdquo;, &ldquo;us&rdquo;). We are based in the United States.
        </p>
        <p>They cover the Diamond Animator app, the AI Animator, the Help Assistant, and anything else we offer that links to these Terms (together, the &ldquo;Service&rdquo;).</p>
        <p>
          By creating an account or using the Service you agree to these Terms and to the <Link href="/privacy">Privacy Policy</Link>. If you
          don&rsquo;t agree, please don&rsquo;t use the Service.
        </p>
      </>
    ),
  },
  {
    id: "who-can-use",
    title: "Who can use Diamond Animator",
    content: (
      <>
        <ul>
          <li><strong>Under 13:</strong> you can&rsquo;t make an account yourself. A parent or legal guardian creates the account with their own email address, agrees (&ldquo;I&rsquo;m the parent or guardian and I agree for my child to use Diamond Animator&rdquo;) and handles payment; the child then uses that account. Sign-up asks your birth year to check this.</li>
          <li><strong>13 to 17 (or under the age of adulthood where you live):</strong> you may use the Service only with the permission of a parent or guardian, who must agree to these Terms and handle payment.</li>
          <li><strong>Adults</strong> can sign up on their own.</li>
        </ul>
        <p>A parent or guardian who sets up or pays for an account is responsible for how the child uses it, including following these Terms.</p>
      </>
    ),
  },
  {
    id: "account",
    title: "Your account",
    content: (
      <ul>
        <li>Give us true, up-to-date information (for example, a real email address you can check).</li>
        <li>Keep your sign-in details private. You are responsible for what happens in your account.</li>
        <li>Tell us right away at <SupportEmail /> if you think someone else has used your account.</li>
        <li>One person per account. Don&rsquo;t sell, share or transfer your account.</li>
      </ul>
    ),
  },
  {
    id: "trial",
    title: "Free trial",
    content: (
      <>
        <p>
          New accounts get a <strong>{TRIAL_DAYS}-day free trial</strong> with every tool and {ACCOUNT_PLANS.trial.credits} AI credits.{" "}
          <strong>No card is needed</strong> to start the trial, so you will not be charged when it ends.
        </p>
        <p>
          <strong>When the trial ends, creating is locked unless you choose a plan.</strong> Your projects stay safe. There is no free plan.
          We may limit trials to one per person or household, and we may change or end the trial offer for new sign-ups.
        </p>
        <p>During your trial we email you tips and tell you before it ends. You can unsubscribe in any of those emails. See the <Link href="/privacy#emails">Privacy Policy</Link>.</p>
      </>
    ),
  },
  {
    id: "subscriptions",
    title: "Plans, billing and price changes",
    content: (
      <ul>
        <li><strong>Monthly and yearly plans.</strong> Plans are billed in advance, either every month or once a year, at the price shown in Plans when you choose one. Taxes may be added where required.</li>
        <li><strong>Payments are handled by our payment provider.</strong> We don&rsquo;t see or store your full card number.</li>
        <li><strong>Automatic renewal.</strong> Your plan renews every month (or every year, on a yearly plan) until you cancel. By choosing a plan, you allow us (through our payment provider) to charge your payment method each month (or each year).</li>
        <li><strong>Cancel anytime</strong> in Plans or by emailing <SupportEmail />. You keep access until the end of the month (or year) you already paid for.</li>
        <li><strong>Discounts.</strong> A discount code follows the rules shown with it. After a discount ends, the plan renews at its normal price.</li>
        <li><strong>Price changes.</strong> If we change the price of your plan, we will tell you by email before it applies to you, so you have time to cancel if you don&rsquo;t want to continue.</li>
        <li><strong>Failed payments.</strong> If a payment fails, that period&rsquo;s credits wait until it is fixed, and we may pause access.</li>
      </ul>
    ),
  },
  {
    id: "ai-credits",
    title: "AI credits",
    content: (
      <p>
        Each plan includes an allowance of AI credits. Credits pay for what the AI makes and answers.{" "}
        <strong>The exact number of credits is shown before anything is made, and at zero credits the AI stops.</strong> Unused plan credits
        don&rsquo;t roll over to the next period unless we say so for a specific offer, and credits have no cash value.
      </p>
    ),
  },
  {
    id: "your-content",
    title: "Your content belongs to you",
    content: (
      <>
        <p><strong>You own what you create</strong>: your drawings, animations, projects, exported videos and the ideas you type in (&ldquo;Your Content&rdquo;). We don&rsquo;t claim ownership of it.</p>
        <p>
          To run the Service, you give us a limited, non-exclusive, worldwide, royalty-free license to store, copy, process, display and send
          Your Content <strong>only as needed to operate, secure and provide the Service to you</strong>, for example saving your projects,
          sending your prompt to our AI providers to get an answer, and making your video export. This license ends when you delete Your
          Content or your account, except for copies we must keep for a short time in backups or to meet legal duties. We will not use Your
          Content in our ads or share it publicly without asking you first.
        </p>
        <p>You are responsible for Your Content and for having the rights to anything you put into it.</p>
      </>
    ),
  },
  {
    id: "ai-output",
    title: "The AI Animator and AI output",
    content: (
      <ul>
        <li>The AI Animator and Help Assistant use artificial intelligence. Your prompts and related project information are sent to our AI providers to produce a reply. <strong>We do not use your content to train AI models.</strong> Our AI providers process it under their own terms and policies.</li>
        <li>As between you and us, you own the animations the AI helps you make, to the extent the law allows. AI output may not be unique: other users may get similar results from similar prompts.</li>
        <li>AI can make mistakes. Results may not match what you asked for. Check your animation before you publish it.</li>
      </ul>
    ),
  },
  {
    id: "rules",
    title: "Rules for using the Service",
    content: (
      <p>
        In short: don&rsquo;t break the law, don&rsquo;t hurt or harass people, don&rsquo;t make sexual content or deepfakes of real people, don&rsquo;t
        copy other people&rsquo;s work without permission, and don&rsquo;t attack, overload, copy or reverse-engineer the Service.
      </p>
    ),
  },
  {
    id: "our-stuff",
    title: "Our app, name and software",
    content: (
      <p>
        The Service itself (the software, the AI Animator&rsquo;s engine, our designs, the Diamond Animator name and logo) belongs to us and is
        protected by law. We give you a personal, limited, non-transferable right to use the Service while your account is in good standing.
        You may not copy, resell, or build a competing product from it. If you send us ideas or feedback, we may use them without owing you
        anything.
      </p>
    ),
  },
  {
    id: "changes",
    title: "Changes to the Service",
    content: <p>Diamond Animator is growing. We plan to add more over time, but we don&rsquo;t promise any particular feature or date. We may add, change or remove features. If we make a change that significantly reduces what you paid for, we will tell you and you can cancel.</p>,
  },
  {
    id: "suspension",
    title: "Suspension and ending your account",
    content: (
      <>
        <p>You can stop using the Service and delete your account at any time in your Profile. We may suspend or close an account that breaks these Terms, puts other people at risk, or that we must close by law. Where it is reasonable, we will warn you first and explain why.</p>
        <p>If your account is closed, you lose access to it. You can ask us to export or delete your data as described in the <Link href="/privacy">Privacy Policy</Link>.</p>
      </>
    ),
  },
  {
    id: "disclaimers",
    title: "Disclaimers",
    content: (
      <p>
        We work hard to make Diamond Animator reliable, but the Service is provided <strong>&ldquo;as is&rdquo; and &ldquo;as available&rdquo;</strong>.
        To the extent the law allows, we don&rsquo;t promise that it will always be available or error-free, or that AI output will be accurate
        or fit a particular purpose. Please keep your own copies of important exports.
      </p>
    ),
  },
  {
    id: "liability",
    title: "Limits on our liability",
    content: (
      <p>
        To the extent the law allows, we are not responsible for indirect, incidental, special or consequential losses (such as lost profits
        or lost data), and our total liability to you for any claim is limited to the amount you paid us in the 3 months before the claim.
        Some places don&rsquo;t allow these limits, so they may not apply to you. Nothing in these Terms limits rights you have under consumer
        law that can&rsquo;t be waived.
      </p>
    ),
  },
  {
    id: "disputes",
    title: "Disputes and governing law",
    content: (
      <>
        <p>If something goes wrong, please email <SupportEmail /> first. Most problems can be fixed quickly.</p>
        <p>These Terms are governed by applicable United States federal and state law.</p>
      </>
    ),
  },
  {
    id: "changes-to-terms",
    title: "Changes to these Terms",
    content: <p>We may update these Terms. If a change is important, we will tell you by email or in the app before it takes effect. The &ldquo;Last updated&rdquo; date at the top shows the latest version. If you keep using the Service after a change takes effect, the new Terms apply.</p>,
  },
  { id: "contact", title: "Contact", content: <p>Diamond Animator<br />Email: <SupportEmail /></p> },
];

export default function TermsPage() {
  return <LegalPage title="Terms of Service" intro="The rules for using Diamond Animator, in plain English. If you’re a kid, please read them with a parent." updated="November 26, 2026" sections={sections} other={{ href: "/privacy", label: "Privacy Policy" }} />;
}
