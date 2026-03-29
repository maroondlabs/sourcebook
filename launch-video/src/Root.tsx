import { Composition } from "remotion";
import { SourcebookLaunch } from "./SourcebookLaunch";

export const Root: React.FC = () => {
  return (
    <Composition
      id="SourcebookLaunch"
      component={SourcebookLaunch}
      durationInFrames={30 * 36} // 36 seconds at 30fps
      fps={30}
      width={1920}
      height={1080}
    />
  );
};
