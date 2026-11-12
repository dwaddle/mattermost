// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, setupFileServer, test} from '@mattermost/playwright-lib';

import {BOR_TAG, concealedPost, createSecondUser, openDm, reveal, sendBorMessage, setupBorTest} from './support';

let fileServerUrl: string;
setupFileServer().then((serverUrl) => {
    fileServerUrl = serverUrl;
});

/**
 * @objective Verify the sender can remove the link preview of a Burn-on-Read message, and the receiver does not see it after revealing.
 */
test('MM-67309 sender removes the link preview from a Burn-on-Read message', {tag: [BOR_TAG]}, async ({pw}) => {
    const {user: sender, team, adminClient} = await setupBorTest(pw, {durationSeconds: 600, maxTTLSeconds: 600});
    const receiver = await createSecondUser(pw, adminClient, team);

    await adminClient.patchConfig({
        ServiceSettings: {
            EnableLinkPreviews: true,
            AllowedUntrustedInternalConnections: new URL(fileServerUrl).hostname,
        },
    });
    await Promise.all(
        [sender, receiver].map((u) =>
            adminClient.savePreferences(u.id, [
                {user_id: u.id, category: 'display_settings', name: 'link_previews', value: 'true'},
                {user_id: u.id, category: 'display_settings', name: 'collapse_previews', value: 'false'},
            ]),
        ),
    );
    await adminClient.createDirectChannel([sender.id, receiver.id]);
    const message = `${fileServerUrl}/opengraph-huge.html`;

    // # Log in as the sender and post a Burn-on-Read message with a link
    const senderApp = await openDm(pw, sender, team, receiver);
    const {id: postId, post: senderPost} = await sendBorMessage(senderApp, message);

    // * Verify the link preview is shown to the sender
    await expect(senderPost.linkPreviewLink.locator).toBeVisible({timeout: pw.duration.half_min});

    // # Log in as the receiver and reveal the message
    const revealApp = await openDm(pw, receiver, team, sender);
    const {post: revealPost} = await concealedPost(revealApp);
    await reveal(revealPost);

    // # Open the conversation as the receiver in a new session, since previews are not rendered on reveal
    const receiverApp = await openDm(pw, receiver, team, sender);
    const receiverPost = receiverApp.center.postList.post({id: postId});

    // * Verify the receiver also sees the link preview
    await expect(receiverPost.linkPreviewLink.locator).toBeVisible({timeout: pw.duration.half_min});

    // # Remove the link preview as the sender
    await senderPost.linkPreviewLink.hover();
    await senderPost.linkPreview.removeButton.commit();
    await expect(senderPost.linkPreviewLink.locator).toHaveCount(0);

    // # Reload as the sender
    await senderApp.page.reload();

    // * Verify the message is still shown without its preview
    await expect(senderPost.messageText.locator).toContainText(message);
    await expect(senderPost.linkPreviewLink.locator).toHaveCount(0);

    // # Reload as the receiver
    await receiverApp.page.reload();

    // * Verify the receiver sees the message without the link preview
    await expect(receiverPost.messageText.locator).toContainText(message);
    await expect(receiverPost.linkPreviewLink.locator).toHaveCount(0);
});
