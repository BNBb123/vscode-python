// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { inject, injectable } from 'inversify';
import { sendTelemetryEvent } from '../../telemetry';
import { EventName } from '../../telemetry/constants';
import { IApplicationShell, ICommandManager } from '../application/types';
import { traceDecorators } from '../logger';
import { IPersistentState, IPersistentStateFactory } from '../types';
import { Common, DataScienceSurveyBanner, ExtensionChannels } from '../utils/localize';
import { noop } from '../utils/misc';
import { IExtensionChannelService, IInsiderExtensionPrompt } from './types';

export const insidersPromptStateKey = 'INSIDERS_PROMPT_STATE_KEY';
export const optIntoInsidersPromptAgainStateKey = 'OPT_INTO_INSIDERS_PROGRAM_AGAIN_STATE_KEY';

@injectable()
export class InsidersExtensionPrompt implements IInsiderExtensionPrompt {
    public readonly hasUserBeenNotified: IPersistentState<boolean>;
    public readonly hasUserBeenAskedToOptInAgain: IPersistentState<boolean>;
    constructor(
        @inject(IApplicationShell) private readonly appShell: IApplicationShell,
        @inject(IExtensionChannelService) private readonly insidersDownloadChannelService: IExtensionChannelService,
        @inject(ICommandManager) private readonly cmdManager: ICommandManager,
        @inject(IPersistentStateFactory) private readonly persistentStateFactory: IPersistentStateFactory
    ) {
        this.hasUserBeenNotified = this.persistentStateFactory.createGlobalPersistentState(insidersPromptStateKey, false);
        this.hasUserBeenAskedToOptInAgain = this.persistentStateFactory.createGlobalPersistentState(optIntoInsidersPromptAgainStateKey, false);
    }

    @traceDecorators.error('Error in prompting to install insiders')
    public async promptToInstallInsiders(): Promise<void> {
        await this.promptAndUpdate(ExtensionChannels.promptMessage(), this.hasUserBeenNotified, EventName.INSIDERS_PROMPT);
    }

    @traceDecorators.error('Error in prompting to enroll back to insiders program')
    public async promptToEnrollBackToInsiders(): Promise<void> {
        await this.promptAndUpdate(ExtensionChannels.optIntoProgramAgainMessage(), this.hasUserBeenAskedToOptInAgain, EventName.OPT_INTO_INSIDERS_AGAIN_PROMPT);
    }

    @traceDecorators.error('Error in prompting to reload')
    public async promptToReload(): Promise<void> {
        const selection = await this.appShell.showInformationMessage(ExtensionChannels.reloadToUseInsidersMessage(), Common.reload());
        sendTelemetryEvent(EventName.INSIDERS_RELOAD_PROMPT, undefined, { selection: selection ? 'Reload' : undefined });
        if (selection === Common.reload()) {
            this.cmdManager.executeCommand('workbench.action.reloadWindow').then(noop);
        }
    }

    private async promptAndUpdate(
        message: string,
        hasPromptBeenShownAlreadyState: IPersistentState<boolean>,
        telemetryEventKey: EventName.INSIDERS_PROMPT | EventName.OPT_INTO_INSIDERS_AGAIN_PROMPT
    ) {
        const prompts = [ExtensionChannels.yesWeekly(), ExtensionChannels.yesDaily(), DataScienceSurveyBanner.bannerLabelNo()];
        const telemetrySelections: ['Yes, weekly', 'Yes, daily', 'No, thanks'] = ['Yes, weekly', 'Yes, daily', 'No, thanks'];
        const selection = await this.appShell.showInformationMessage(message, ...prompts);
        sendTelemetryEvent(telemetryEventKey, undefined, { selection: selection ? telemetrySelections[prompts.indexOf(selection)] : undefined });
        await hasPromptBeenShownAlreadyState.updateValue(true);
        if (!selection) {
            return;
        }
        if (selection === ExtensionChannels.yesWeekly()) {
            await this.insidersDownloadChannelService.updateChannel('weekly');
        } else if (selection === ExtensionChannels.yesDaily()) {
            await this.insidersDownloadChannelService.updateChannel('daily');
        }
    }
}
