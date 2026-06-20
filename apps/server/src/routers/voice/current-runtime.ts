import { VoiceRuntime } from '../../runtimes/voice';
import { invariant } from '../../utils/invariant';

const getCurrentVoiceRuntime = (userId: number): VoiceRuntime => {
  const runtime = VoiceRuntime.findRuntimeByUserId(userId);

  invariant(runtime, {
    code: 'BAD_REQUEST',
    message: 'User is not in a voice channel'
  });

  return runtime;
};

export { getCurrentVoiceRuntime };
