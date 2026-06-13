import React from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Share,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { Colors } from '../constants/colors';

interface Props {
  shareToken: string;
  parentBaseUrl?: string;
}

const DEFAULT_BASE = 'https://815local.com/sports/parent.html';

export default function ShareSheet({ shareToken, parentBaseUrl = DEFAULT_BASE }: Props) {
  const parentUrl = `${parentBaseUrl}?t=${shareToken}`;

  const handleShare = async () => {
    try {
      await Share.share({
        message: `Follow the game live (free, no app needed): ${parentUrl}`,
        url: parentUrl,
        title: 'Watch the game live',
      });
    } catch {
      // user dismissed
    }
  };

  const handleCopy = async () => {
    // Use the native Share sheet with a copy-friendly message
    await handleShare();
  };

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Free Parent View</Text>
      <Text style={styles.subheading}>
        Parents can follow the game live in any browser. No app download. No paywall. Ever.
      </Text>

      <View style={styles.qrWrapper}>
        <QRCode
          value={parentUrl}
          size={180}
          color={Colors.navy}
          backgroundColor={Colors.white}
        />
      </View>

      <View style={styles.linkBox}>
        <Text style={styles.linkText} numberOfLines={2} selectable>
          {parentUrl}
        </Text>
      </View>

      <TouchableOpacity style={styles.copyBtn} onPress={handleCopy}>
        <Text style={styles.copyBtnText}>Copy Link</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.shareBtn} onPress={handleShare}>
        <Text style={styles.shareBtnText}>Share via Messages / Email</Text>
      </TouchableOpacity>

      <Text style={styles.note}>
        The parent view updates every 15 seconds automatically.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
    alignItems: 'center',
  },
  heading: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.navy,
    marginBottom: 8,
  },
  subheading: {
    fontSize: 14,
    color: Colors.muted,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  qrWrapper: {
    padding: 16,
    backgroundColor: Colors.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 20,
  },
  linkBox: {
    backgroundColor: Colors.surfaceAlt,
    borderRadius: 10,
    padding: 12,
    width: '100%',
    marginBottom: 12,
  },
  linkText: {
    fontSize: 12,
    color: Colors.muted,
    fontFamily: 'monospace',
  },
  copyBtn: {
    width: '100%',
    height: 48,
    backgroundColor: Colors.surfaceAlt,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  copyBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.navy,
  },
  shareBtn: {
    width: '100%',
    height: 52,
    backgroundColor: Colors.navy,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  shareBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.white,
  },
  note: {
    fontSize: 12,
    color: Colors.muted,
    textAlign: 'center',
  },
});
