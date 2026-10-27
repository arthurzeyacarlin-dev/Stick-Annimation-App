"use client";

import styles from "./AppHeader.module.css";

// The Description and Terms of Service shown from the menu (same words as before the redesign).
export function AboutBody() {
  return (
            <div className={styles.dialogBody}>
              <h3>Diamond Animator</h3>
              <p>
                Diamond Animator is an animation studio made for stick-figure animation. Draw your
                characters, bring them to life frame by frame, and share what you make.
              </p>
              <h4>What you can do</h4>
              <ul>
                <li>Draw with the brush, eraser, fill, shapes, text, lasso and knife</li>
                <li>Animate on a timeline with frames, keyframes, layers and onion skin</li>
                <li>Talk to the AI Animator about your animation in plain words</li>
                <li>Export your animation as a video, a GIF or pictures</li>
                <li>Get answers any time from the Help Assistant</li>
              </ul>
              <p>
                Your projects are saved to your account. The AI Animator and the Help Assistant use AI credits; drawing
                and exporting are free.
              </p>
              <p className={styles.dialogMuted}>
                Diamond Animator is made by Arthur and gets better with every update. Found a problem? Use Report a Problem
                in this menu — every report is read.
              </p>
            </div>
  );
}

export function TermsBody() {
  return (
            <div className={styles.dialogBody}>
              <h3>Diamond Animator</h3>
              <h4>1. Purpose of the Platform</h4>
              <p>
                Diamond Animator is a creative animation workspace designed for building original animated content using drawing
                tools, character systems, and AI assistance.
              </p>
              <p>
                The platform is built to support a wide range of creative styles, from action and storytelling to education, comedy,
                experimental animation, and beyond. You are not limited to specific genres or formats. Creativity is open-ended, as
                long as it stays within safe and responsible boundaries.
              </p>
              <h4>2. Creative Freedom</h4>
              <p>You are free to create original animated content of many kinds, including but not limited to:</p>
              <ul>
                <li>Action scenes and stylized cartoon fighting (non-graphic)</li>
                <li>Story-driven animations</li>
                <li>Educational content</li>
                <li>Fictional worlds and characters</li>
                <li>Experimental or artistic projects</li>
                <li>Comedy and entertainment</li>
              </ul>
              <p>These are examples, not limits. Diamond Animator is designed to support imagination, not restrict it.</p>
              <h4>3. Not Allowed Content</h4>
              <ul>
                <li>
                  <b>Sexual content of any kind</b> (including nudity, sexual acts, or explicit material). This may result in
                  immediate removal.
                </li>
                <li>
                  <b>Graphic or extreme violence</b> (gore, torture, dismemberment, or disturbing violent detail).
                </li>
                <li>
                  <b>Teaching illegal or harmful activities</b> (content intended to show others how to perform unlawful or dangerous
                  actions).
                </li>
                <li>
                  <b>Encouraging self-harm or harm toward others</b>.
                </li>
              </ul>
              <p>Diamond Animator is not a platform for content that promotes real-world harm.</p>
              <h4>4. Enforcement</h4>
              <ul>
                <li>A warning may appear stating the content may violate policy.</li>
                <li>Some content may be blocked or restricted.</li>
                <li>Severe violations may result in immediate removal.</li>
              </ul>
              <h4>5. Keep It Creative</h4>
              <p>
                Diamond Animator is built to support ambitious creativity within clear safety standards. Users are expected to use the
                platform responsibly and in alignment with these guidelines.
              </p>
            </div>
  );
}
