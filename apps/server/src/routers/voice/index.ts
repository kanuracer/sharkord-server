import { t } from '../../utils/trpc';
import { closeProducerRoute } from './close-producer';
import { connectConsumerTransportRoute } from './connect-consumer-transport';
import { connectProducerTransportRoute } from './connect-producer-transport';
import { consumeRoute } from './consume';
import { createConsumerTransportRoute } from './create-consumer-transport';
import { createProducerTransportRoute } from './create-producer-transport';
import { disconnectUserRoute } from './disconnect-user';
import {
  onUserDisconnectVoiceRoute,
  onUserJoinVoiceRoute,
  onUserLeaveVoiceRoute,
  onUserUpdateVoiceStateRoute,
  onVoiceAddExternalStreamRoute,
  onVoiceNewProducerRoute,
  onVoiceProducerClosedRoute,
  onVoiceReactionRoute,
  onVoiceRemoveExternalStreamRoute,
  onVoiceSoundboardRoute,
  onVoiceUpdateExternalStreamRoute
} from './events';
import { getProducersRoute } from './get-producers';
import { joinVoiceRoute } from './join';
import { leaveVoiceRoute } from './leave';
import { moveUserRoute } from './move-user';
import { playSoundboardRoute } from './play-soundboard';
import { produceRoute } from './produce';
import { reactVoiceRoute } from './react';
import { recoverMediaRoute } from './recover-media';
import { setConsumerQualityRoute } from './set-consumer-quality';
import { updateVoiceStateRoute } from './update-state';

export const voiceRouter = t.router({
  join: joinVoiceRoute,
  react: reactVoiceRoute,
  playSoundboard: playSoundboardRoute,
  recoverMedia: recoverMediaRoute,
  leave: leaveVoiceRoute,
  updateState: updateVoiceStateRoute,
  moveUser: moveUserRoute,
  disconnectUser: disconnectUserRoute,
  createProducerTransport: createProducerTransportRoute,
  connectProducerTransport: connectProducerTransportRoute,
  createConsumerTransport: createConsumerTransportRoute,
  connectConsumerTransport: connectConsumerTransportRoute,
  closeProducer: closeProducerRoute,
  produce: produceRoute,
  consume: consumeRoute,
  setConsumerQuality: setConsumerQualityRoute,
  getProducers: getProducersRoute,
  onJoin: onUserJoinVoiceRoute,
  onLeave: onUserLeaveVoiceRoute,
  onDisconnect: onUserDisconnectVoiceRoute,
  onUpdateState: onUserUpdateVoiceStateRoute,
  onNewProducer: onVoiceNewProducerRoute,
  onProducerClosed: onVoiceProducerClosedRoute,
  onReaction: onVoiceReactionRoute,
  onSoundboard: onVoiceSoundboardRoute,
  onAddExternalStream: onVoiceAddExternalStreamRoute,
  onUpdateExternalStream: onVoiceUpdateExternalStreamRoute,
  onRemoveExternalStream: onVoiceRemoveExternalStreamRoute
});
