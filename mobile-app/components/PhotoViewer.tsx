import React, { useEffect, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  Image,
  Dimensions,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { colors } from '../constants/theme';

export type ViewerPhoto = {
  id: string;
  url: string;
  /** Optional caption shown in the header (e.g. "AVANT · Hall RDC") */
  label?: string;
};

type Props = {
  visible: boolean;
  photos: ViewerPhoto[];
  initialIndex?: number;
  onClose: () => void;
  /** Si fourni, un bouton "Supprimer" apparaît dans le header. */
  onDelete?: (photoId: string) => Promise<void> | void;
};

/**
 * Viewer plein écran : swipe horizontal entre photos. Réutilisé par
 * l'écran agent (mission), admin (validation) et client (rapport).
 * Pas de zoom interactif natif (on garde la dépendance zéro) — l'image
 * est affichée en `resizeMode="contain"`.
 */
export function PhotoViewer({ visible, photos, initialIndex = 0, onClose, onDelete }: Props) {
  const [index, setIndex] = useState(initialIndex);
  const [deleting, setDeleting] = useState(false);
  const listRef = useRef<FlatList<ViewerPhoto>>(null);
  const { width: screenWidth } = Dimensions.get('window');

  useEffect(() => {
    if (visible) {
      setIndex(initialIndex);
      // Saute à l'index initial après le mount.
      setTimeout(() => {
        listRef.current?.scrollToIndex({ index: initialIndex, animated: false });
      }, 0);
    }
  }, [visible, initialIndex]);

  const current = photos[index];

  const handleDelete = async () => {
    if (!onDelete || !current) return;
    Alert.alert(
      'Supprimer la photo',
      'Cette action est définitive.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await onDelete(current.id);
              // Si on supprime la dernière, on ferme.
              if (photos.length <= 1) {
                onClose();
              } else if (index === photos.length - 1) {
                setIndex(index - 1);
              }
            } catch (e: any) {
              Alert.alert('Erreur', e?.message ?? 'Impossible de supprimer.');
            } finally {
              setDeleting(false);
            }
          },
        },
      ]
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View style={styles.header}>
          <Pressable onPress={onClose} style={styles.headerBtn} hitSlop={8}>
            <MaterialIcons name="close" size={26} color="#fff" />
          </Pressable>
          <View style={{ flex: 1 }}>
            {current?.label ? (
              <Text style={styles.headerLabel} numberOfLines={1}>
                {current.label}
              </Text>
            ) : null}
            <Text style={styles.headerCount}>
              {photos.length > 0 ? `${index + 1} / ${photos.length}` : '—'}
            </Text>
          </View>
          {onDelete ? (
            <Pressable
              onPress={handleDelete}
              style={styles.headerBtn}
              disabled={deleting}
              hitSlop={8}
            >
              {deleting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <MaterialIcons name="delete-outline" size={26} color="#fff" />
              )}
            </Pressable>
          ) : (
            <View style={styles.headerBtn} />
          )}
        </View>

        <FlatList
          ref={listRef}
          data={photos}
          keyExtractor={(p) => p.id}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          getItemLayout={(_, i) => ({
            length: screenWidth,
            offset: screenWidth * i,
            index: i,
          })}
          initialScrollIndex={initialIndex}
          onMomentumScrollEnd={(e) => {
            const next = Math.round(e.nativeEvent.contentOffset.x / screenWidth);
            setIndex(next);
          }}
          renderItem={({ item }) => (
            <View style={[styles.page, { width: screenWidth }]}>
              <Image
                source={{ uri: item.url }}
                style={styles.image}
                resizeMode="contain"
              />
            </View>
          )}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.96)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingTop: 50,
    paddingBottom: 12,
  },
  headerBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  headerLabel: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  headerCount: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  page: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
});
