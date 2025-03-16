import "../styles/globals.css";
import type { AppProps } from "next/app";
import { AudioPlayer } from '@/components/AudioPlayer';

export default function MyApp({ Component, pageProps }: AppProps) {
  return (
    <>
      <AudioPlayer />
      <Component {...pageProps} />
    </>

  );
}