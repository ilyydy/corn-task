// https://github.com/spotify/spotify-web-api-ts-sdk/blob/main/src/types.ts

export interface RefreshTokenData {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
}

export interface User {
  country: string;
}

export interface Page<TItemType> {
  href: string;
  items: TItemType[];
  limit: number;
  next: string | null;
  offset: number;
  previous: string | null;
  total: number;
}

export type SavedTracksPage = Page<SavedTrack>

export interface SavedTrack {
  /**
   * '2024-04-26T09:54:10Z'
   */
  added_at: string;
  track: Track;
}

export interface Track extends SimplifiedTrack {
  album: SimplifiedAlbum;
  external_ids: ExternalIds;
  popularity: number;
}

export interface SimplifiedTrack {
  artists: SimplifiedArtist[];
  available_markets: string[];
  disc_number: number;
  duration_ms: number;
  // episode: boolean;
  explicit: boolean;
  external_urls: ExternalUrls;
  href: string;
  id: string;
  is_local: boolean;
  name: string;
  preview_url: string | null;
  // track: boolean;
  track_number: number;
  type: string;
  uri: string;
  is_playable?: boolean;
  linked_from?: LinkedFrom;
  restrictions?: Restrictions;
}

export interface SimplifiedArtist {
  external_urls: ExternalUrls;
  href: string;
  id: string;
  name: string;
  type: string;
  uri: string;
}

export interface ExternalUrls {
  spotify: string;
}

export interface LinkedFrom {
  external_urls: ExternalUrls;
  href: string;
  id: string;
  type: string;
  uri: string;
}

export interface Restrictions {
  reason: string;
}

interface AlbumBase {
  album_type: string;
  available_markets: string[];
  copyrights: Copyright[];
  external_ids: ExternalIds;
  external_urls: ExternalUrls;
  genres: string[];
  href: string;
  id: string;
  images: Image[];
  label: string;
  name: string;
  popularity: number;
  release_date: string;
  release_date_precision: string;
  restrictions?: Restrictions;
  total_tracks: number;
  type: string;
  uri: string;
}

export interface SimplifiedAlbum extends AlbumBase {
  album_group: string;
  artists: SimplifiedArtist[];
}
export interface Copyright {
    text: string
    type: string
}

export interface ExternalIds {
  upc: string;
}

export interface Image {
  url: string;
  height: number;
  width: number;
}

export interface MyTrack {
  id: string;
  name: string;
  originName: string;
  artists: {
    id: string;
    name: string;
    originName: string;
  }[];
  album: {
    id: string;
    name: string;
    originName: string;
  };
  added_at: string;
  playable: boolean;
}
